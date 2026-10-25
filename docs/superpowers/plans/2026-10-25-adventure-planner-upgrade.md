# Adventure Planner upgrade: saved trips, deliverables, hand-off, chat history

## Context

John reviewed the live assistant (https://magical-assistant.magicalvacations.workers.dev). His verdict: "it looks awesome… very simple to use which is the key!" He called the Adventure Planner "the biggest opportunity" and asked for:
- trip conversations that are saved and can be pinned, by client last name, so Jillian can revisit active trips and keep chatting;
- client deliverables she can download as HTML or PDF: a proposal comparing options, an itinerary and an estimate;
- a hand-off from Welcome Center to Adventure Planner;
- saved history for the "Make a wish" chat.

Today the app deliberately stores nothing; every request stands alone. Michael chose **Cloudflare D1** for storage and approved the design as walked through:
- **Trips list:** pinned trips first, then recent.
- **Trip workspace:** the plan plus an ongoing conversation, with a deliverables side panel.
- **Branded deliverable pages** with Download PDF and Download HTML.
- **Never-invented prices,** with totals computed by code.
- **Welcome Center:** a "Start a trip" button.
- **"Your chats"** history on the chat page.

Work email access and image generation are out of scope for this round.

## Decisions (Michael)
- Storage: Cloudflare D1, behind the existing magic-words session.
- Design as described: trips by client last name, pin and delete; deliverables saved as versions; prices only from Jillian; totals added up by code; a hand-off button; chat history list.

## My calls (veto any)
- One generic `conversations` table serves both trips and chats; messages and deliverables hang off it. Deleting a conversation deletes its messages and deliverables (`ON DELETE CASCADE`).
- There's no automatic expiry: Jillian deletes trips herself.
- The **server** owns conversation history. The browser sends only the new message, and the Worker loads history from D1. Only the new message is checked for sensitive data and masked, and it's stored masked.
- **Deliverables are structured JSON** produced by Claude with structured outputs (`output_config.format`). One pure function renders the JSON into standalone branded HTML. The same HTML is used for the in-app preview (iframe `srcdoc`), the HTML download (Blob), and the PDF (open the HTML in a new window and call `print()`; Safari and Chrome both "Save as PDF").
- The legal footer and her signature are pulled from `brains/reference/compliance.md` and `voice.md` at build time, so brains stays the single source.
- `/api/draft` stays for Magic Mail, Welcome Center and Spread the Magic. Adventure Planner and chat move to the conversations API, and the old `/api/chat` is removed.
- The model stays `claude-opus-5-5`, unchanged. History uses prompt caching (a breakpoint on the last message) so long trips stay cheap.

## Data model: `migrations/0001_conversations.sql`
```sql
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,              -- crypto.randomUUID()
  kind TEXT NOT NULL CHECK (kind IN ('trip','chat')),
  title TEXT NOT NULL,              -- "Rivera family" / first chat question (≤60 chars)
  details TEXT NOT NULL DEFAULT '{}', -- JSON: trip fields {lastName,destination,dates,party,resort,priorities,summary}
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL, role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  content TEXT NOT NULL, sources TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
  UNIQUE (conversation_id, seq)
);
CREATE TABLE deliverables (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('proposal','itinerary','estimate')), version INTEGER NOT NULL,
  data TEXT NOT NULL,               -- JSON matching the kind's schema
  created_at INTEGER NOT NULL
);
CREATE INDEX conversations_list ON conversations (kind, pinned DESC, updated_at DESC);
```
`wrangler.jsonc` gets `d1_databases: [{ binding: "DB", database_name: "magical-assistant", database_id: "<from wrangler d1 create>", migrations_dir: "migrations" }]`. Then run `npm run cf-typegen`, so `Env.DB: D1Database`. Turn foreign keys on with `PRAGMA foreign_keys = ON` per batch, or delete child rows explicitly in `deleteConversation`; the implementer verifies D1's behavior.

## API (Worker; every route requires `hasValidSession`)
| Route | Purpose |
|---|---|
| `GET /api/conversations?kind=trip\|chat` | list: id, title, details, pinned, updated_at (pinned first, then updated_at desc) |
| `POST /api/conversations` `{kind, title?, details?}` | create (trip title defaults to `"<lastName> family"`) |
| `GET /api/conversations/:id` | conversation + messages + deliverable metadata (id, kind, version, created_at) |
| `PATCH /api/conversations/:id` `{pinned?, title?, details?}` | pin, rename, edit trip details |
| `DELETE /api/conversations/:id` | delete with messages and deliverables |
| `POST /api/conversations/:id/messages` `{content}` | guard and mask, save the user message, stream Claude (existing SSE protocol), save the assistant message on `done` |
| `POST /api/conversations/:id/deliverables` `{kind}` | Claude structured output; validate; save as next version; return `{id, kind, version, data}` |
| `GET /api/deliverables/:id` | `{kind, version, data, footer, signature}` for rendering |

**Validation:**
- A message is at most 4,000 characters, and conversation history over 200,000 characters returns 413 ("This trip conversation is very long — start a fresh trip to keep going").
- Unknown id returns 404 and wrong kind returns 400.
- `findSensitive` and `maskContacts` apply to every new user message.

**Prompts:**
- **Trips:** the system prompt is `buildSystem("adventure-planner")`. The first user message is `buildUserMessage("adventure-planner", details)` (plus `summary` when it came from Welcome Center). The server builds it when Jillian clicks **Plan it** (`POST /api/conversations/:id/plan`); see the review fixes below.
- **Chat:** `buildChatSystem()`.
- **Deliverables:** a new `brains/deliverables.md` (not a skill, so it stays out of the plugin) holds the rules: client-facing tone, use only prices Jillian provided in the conversation, otherwise leave `amount: null`. It's sent with the conversation history plus "Create the <kind> as JSON".

## Deliverable schemas (`shared/deliverables.ts`)
- `Proposal { title, intro, options: {name, summary, highlights[], bestFor, price: {amount: number|null, note}}[] (2–4), recommendation, nextSteps[], verifyNotes[] }`
- `Itinerary { title, intro, days: {title, items: {time?: string, text}[]}[], tips[], verifyNotes[] }`
- `Estimate { title, lineItems: {label, qty: number, unitPrice: number|null, note?}[], notes[], verifyNotes[] }`

Also in `shared/deliverables.ts`:
- `DELIVERABLE_SCHEMAS` (JSON Schema, for `output_config.format`, `additionalProperties: false`)
- `validateDeliverable(kind, unknown) → {ok, data} | {ok:false, error}`
- `estimateTotals(est) → {total: number, missing: string[]}` (sum of qty × unitPrice; lines with a null price are listed as missing)
- `renderDeliverableHtml(doc, {footer, signature}) → string`: a standalone HTML page with inline CSS, the Storybook palette, Fraunces/Wix Madefor via Google Fonts link, her signature block and legal footer. "Add price" appears where amount is null. All text is HTML-escaped.

## Welcome Center hand-off
- `brains/skills/welcome-center/SKILL.md`: add a required block inside "For Jillian only":
  ```
  **Trip hand-off**
  - Client last name: …
  - Destination: …            (one of the Adventure Planner options, or "unknown")
  - Dates: …
  - Who's going: …
  - Priorities: …
  - Summary: one short paragraph
  ```
  Then `npm run build:plugin`.
- `shared/sections.ts`: `parseTripHandoff(internal: string) → {lastName, destination, dates, party, priorities, summary} | null`. A destination that isn't one of `TOOLS["adventure-planner"]` options becomes "".
- The `DraftPanel` (welcome-center only) shows a **Start a trip** button when the parse succeeds. It opens `#/trips/new` with the details form prefilled from the parsed hand-off (passed through session state). The trip is created only when she clicks **Plan it**.

## UI
- **Routes:**
  - `#/trips` → `TripsPage` (list: pinned section, recent, search by last name, **+ New trip**)
  - `#/trips/new` → the details form (the `ToolForm` with adventure-planner fields plus a required **Client last name** field)
  - `#/trips/:id` → `TripPage`
  - `#/chat` and `#/chat/:id` → `ChatPage` with a "Your chats" list
  - The Adventure Planner home tile now goes to `#/trips`.
- **`TripPage`:** a header with the family name, destination, dates, a pin toggle and edit details. The left side is `ConversationThread` + `Composer`. Assistant messages render through `splitDraft`, so they get day blocks with **Copy day**, a collapsible "For Jillian only" notes panel and `Sources`. The right side is `DeliverablesPanel`: ✨ Proposal / ✨ Itinerary / ✨ Estimate buttons (with a waiting state), and a version list → **Open** (a modal with iframe preview), **PDF**, **HTML**.
- **Extract from the current `ChatPage`:** `ConversationThread` (bubbles, waiting sparkles, Copy) and `Composer` (textarea, `MicButton`, Send). Both pages reuse them. `chatStore` becomes a per-conversation store keyed by id, using the same reducer (`src/lib/chatState.ts`). The client sends only `{content}`.
- **Home "Make a wish" bar:** creates a chat conversation, posts the first message, and goes to `#/chat/:id`.

## Files
- **New:**
  - `migrations/0001_conversations.sql`
  - `worker/store.ts` (D1 queries)
  - `worker/conversations.ts` (route handlers)
  - `worker/deliverables.ts`
  - `shared/deliverables.ts`
  - `brains/deliverables.md`
  - `src/pages/TripsPage.tsx`, `src/pages/TripPage.tsx`
  - `src/components/{ConversationThread,Composer,DeliverablesPanel,DeliverableModal}.tsx`
  - `src/lib/api.ts` (fetch helpers)
  - `tests/helpers/fakeD1.ts` (D1-compatible adapter over `node:sqlite`, which is confirmed available in Node 24)
  - tests listed below
- **Changed:**
  - `wrangler.jsonc`, `worker/index.ts` (routes), `worker/prompt.ts` (`extractFooter`, `extractSignature`, deliverables system)
  - `worker/claude.ts`: reuse `streamClaude`, adding an `onDone(text, sources)` callback so the conversation route can save the assistant message
  - `worker/chat.ts` (removed, folded into conversations)
  - `shared/sections.ts`, `brains/skills/welcome-center/SKILL.md`, `brains/skills/adventure-planner/SKILL.md`. The latter gets a follow-up rule: when she asks for a change, reply with the changed `### Day N` blocks in full plus a one-line summary.
  - `src/App.tsx`, `src/pages/{Home,ChatPage}.tsx`, `src/components/DraftPanel.tsx`, `src/lib/chatStore.ts`
  - `README.md` (D1 setup), `docs/MAINTAINING.md` (trips and privacy, deleting a trip)

## Fixes from the builder review (folded in)
- **Saving replies safely.**
  - Save Jillian's message and Claude's reply **together in one `DB.batch()`, only after the reply finishes**. Do it **before** sending `done`; if the save fails, send `error` instead.
  - Save the **accumulated streamed text**, which covers `pause_turn` resumes too.
  - Never save a refusal.
  - `worker/index.ts` `fetch(request, env, ctx)` passes `ctx`, and the stream work runs under `ctx.waitUntil`.
  - If she reloads mid-reply, the reply is lost cleanly: nothing half-saved, and her message goes back in the box. That's accepted for now, since a background runner (Durable Object) would be a much bigger build.
- **No double charges.**
  - A per-conversation **busy lock**: a conditional `UPDATE conversations SET busy_until=? WHERE id=? AND (busy_until IS NULL OR busy_until<?)`. A second request returns 409 ("Still working on the last one…").
  - The first plan starts from the **Plan it** button through `POST /api/conversations/:id/plan`, never automatically on page load. The **server** builds the first message with `buildUserMessage("adventure-planner", details)` and stores it as message 1, so the cached prefix stays stable.
  - The 4,000-character limit applies only to typed messages. Trip `details` on POST and PATCH go through `findSensitive` and `maskContacts` too.
  - `deliverables` gets `UNIQUE(conversation_id, kind, version)`, with the version computed inside the `INSERT … SELECT`. Add the column `conversations.busy_until INTEGER`.
- **Deliverable generation.**
  - Streamed through the same SSE protocol with keepalives and a new final event `{event:"deliverable", data:{id, kind, version}}` (added to `shared/sse.ts`).
  - Use `stream()` + `finalMessage()`, with **no web search tool**, because citations conflict with `output_config.format`.
  - The JSON schemas have **no `minItems`/`maxItems`**; option counts are checked in `validateDeliverable`.
  - Check `stop_reason` (refusal or max_tokens) before parsing, and parse the text block that follows any thinking blocks.
- **Price safety in code.** After validation, any price that doesn't appear among the numbers in Jillian's saved messages is set to `null` and shows "Add price". The catch: a package total that Claude splits into line items gets blanked, and Jillian fills those in herself.
- **The plan stays copyable.** When Jillian asks for a change, the adventure-planner rule has Claude reply with the **full updated day-by-day plan**, not just the changed days. The newest plan message is marked "Current plan" and keeps **Copy all days** and **Copy day**. It costs a little more per change, but there's no merge logic, so pasting into Travefy keeps working.
- **Editing trip details later** appends a short note to the conversation ("Trip details changed: dates now …"), which Claude uses on the next turn. It doesn't re-plan automatically.
- **Hand-off.** **Start a trip** carries the parsed details to `#/trips/new` through the URL and session state. The trip is created only when she clicks **Plan it**, so backing out leaves no empty trip.
- **D1.** Foreign keys are always enforced, so drop the PRAGMA step. `fakeD1.batch()` must be atomic. Mention D1 Time Travel (restoring a trip deleted by mistake) in `MAINTAINING.md`.
- **Sign-in rate limit,** now that client details are stored: at most 10 failed attempts per IP per 15 minutes, counted in a D1 table `login_failures(ip, at)`; the next attempt returns 429 "Too many tries — wait a few minutes."

## Michael's answers to the review questions
- **Fixing a deliverable: edit in the preview.**
  - The preview modal has two modes:
    - **Review**, Jillian's view: prices, line items and text fields are editable, the internal `verifyNotes` show, and gaps are highlighted.
    - **Client copy**: the clean render used for PDF and HTML, which hides `verifyNotes`.
  - **Save edits** calls `POST /api/deliverables/:id/edit {data}`. It validates and saves the next version **with no AI call** and recomputes totals in code. Prices Jillian types in are trusted, so the price-provenance check applies only to AI-generated versions.
  - Downloading with any "Add price" left shows an in-app warning banner with **Download anyway**, never a browser `confirm()`.
  - No pricing disclaimer is added beyond her footer until Jillian supplies the wording. Add a TODO in `compliance.md`: "Client document disclaimer (e.g. prices subject to availability)".
- **Proposal options: Claude researches and suggests, or Jillian lists her own, or both.** The Proposal button opens a small panel:
  - **Suggest options for me** posts a normal trip message through the existing streaming route **with web search**, e.g. "Research and suggest 2–3 options for this trip (resorts/ships/packages) with what's included, who each suits and sources; mark any prices 'verify'." The suggestions land in the conversation, where she can refine them by chatting.
  - **My options** is an optional textarea for her own list and prices, added to the conversation as her message.
  - **Make the proposal** runs the structured, no-web-search deliverable call over the conversation.
  - Prices Claude found online stay "verify" in the chat and come out as `null`/"Add price" in the document under the code check. She types the real ones in the preview.
  - Be honest in the UI copy: the research finds options and general details, while real availability and pricing come from her supplier and Travefy tools.

## Also this round: Inbox Helper (Michael added it)
Her work mail is Microsoft 365 (`mmvagent.com`'s MX is `mail.protection.outlook.com`), probably MMV-managed. A live mailbox connection needs MMV's admin approval and policy OK, so it waits. This round adds a **paste-in** tool instead:
- `TOOLS["inbox-helper"]`:
  - name "Inbox Helper", subtitle "Prioritize and reply", icon `inbox`, effort `medium`, no web search, notesFirst true;
  - field `emails*`: "Paste the emails or thread", textarea, 20,000 characters.
- A new skill `brains/skills/inbox-helper/SKILL.md`, which also goes into the plugin:
  - The client part is ready-to-send replies, one `### Reply to <first name> — <topic>` block each, with `**Subject:**`, her signature and the footer.
  - "For Jillian only" holds the priority list (**Today / This week / FYI**, one line each with why) and anything to verify.
  - It never invents prices or policies, and contact details are masked as usual.
- It reuses `/api/draft`, `ToolPage` and `DraftPanel`. Reply blocks get a **Copy reply** button via the existing `splitDraft` day-block pattern, generalized to `### ` blocks.
- The home grid becomes 5 tiles.

## Later (not this round): images for Spread the Magic
Michael is considering **Nano Banana** (Google's Gemini image model) or **Google Flow** (Google's AI video-making tool).
- **Nano Banana is the one to wire in.** It has an API, so a **✨ Make an image** button in Spread the Magic could call it from the Worker (a Google API key as a Worker secret). It suits editing her own photos best (adding text and her colors, restyling) rather than inventing park scenes.
- **Flow is better used by John directly.** It's an app for short video clips, not something to build in.
- **Compliance limit, either way:** no Disney or Universal characters, castles, logos or recognizable park landmarks in generated images. The Spread the Magic checklist would cover images too.
- Plan this as its own round after the Adventure Planner work.

## Updated implementation order
1. D1 database: create it with `npx.cmd wrangler d1 create magical-assistant` (on Michael's logged-in account), then `wrangler d1 migrations apply --local` and cf-typegen. Then the migration (with `busy_until`, `login_failures`, the deliverables UNIQUE constraint), `fakeD1`, `store.ts` + tests.
2. Conversations API: busy lock, batch save after completion, `ctx.waitUntil`, Plan it route, details guard, sign-in rate limit, with tests.
3. Deliverables:
   - schemas/validation/totals/renderer (review and client modes) and the price-provenance check;
   - the SSE `deliverable` event and the generate route;
   - the edit route;
   - tests for all of it.
4. Welcome Center hand-off (no trip until Plan it) and the Inbox Helper tool, skill and plugin rebuild.
5. UI: trips list, trip page (current-plan badge, Copy all days), deliverables panel, proposal options panel and editable preview modal, chat history, 5-tile home.
6. Docs; then deploy with `--remote` migrations.

## Verification
- `npm test`: store (CRUD, pin order, cascade delete), conversations routes (history saved and reloaded, masked storage, card blocked before any DB write or Claude call, 413 on long history, 401 without session), deliverables (schema validation rejects bad JSON; `estimateTotals` sums and lists missing prices; renderer escapes `<script>`, includes footer and signature, shows "Add price"), `parseTripHandoff` (good block, unknown destination becomes "", missing block → null). `npm run typecheck`, `npm run build`, `build:plugin --check`.
- Live, local with the real key (about $1–2):
  - create a trip and get a plan, ask for a change, then reload the page and confirm the conversation is still there;
  - pin it and check it moves to the top;
  - generate all three deliverables and confirm the estimate total is right and missing prices read "Add price";
  - download the HTML and open it standalone, and print to PDF;
  - run a Welcome Center inquiry → **Start a trip** → prefilled form;
  - start a "Make a wish" chat, then reload and confirm it's listed and reopens.
- Also live, local:
  - **Suggest options for me**: researched options appear with sources, then Make the proposal; the online prices show as "Add price";
  - type prices in the preview, save, and confirm a new version with a correct total;
  - the client copy and downloads hide internal notes;
  - press Plan it twice quickly and confirm only one AI call (the second gets 409);
  - reload mid-reply and confirm nothing half-saved;
  - Inbox Helper with 3 pasted emails: priorities plus three copyable replies;
  - 11 wrong sign-ins: the 11th returns 429.
- After deploying: run the same smoke test on the live site once Michael signs in in the browser pane.
