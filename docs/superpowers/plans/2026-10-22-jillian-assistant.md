# Magical Vacations Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Disney-feeling, login-protected website with four drafting tools for Jillian, built on the Claude API, plus the same brains packaged as a Claude app plugin.

**Architecture:** A single TypeScript package. The React + Vite UI is served as static assets by one Cloudflare Worker. The Worker's `POST /api/draft` builds a system prompt from the Markdown files in `brains/`, calls Claude with streaming, and re-emits a small SSE protocol to the browser. Code shared by the browser and the Worker (guards, tool definitions, SSE codec, section parser) lives in `shared/`. A Node script turns `brains/` into a Claude plugin folder plus a zip.

**Tech Stack:** TypeScript 5, React 19, Vite 7, `@cloudflare/vite-plugin`, Wrangler 4, `@anthropic-ai/sdk` 1.x, `jose`, `marked`, `dompurify`, `fflate`, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-22-jillian-assistant-design.md`

## Global Constraints

- Model `claude-opus-5-5`. Never set `thinking`. Set `output_config.effort` explicitly: `medium` for magic-mail, welcome-center and spread-the-magic; `high` for adventure-planner. `max_tokens: 16000`.
- Refusal fallback: beta `server-side-fallback-2026-07-01` with `fallbacks: "default"`.
- Web search tool `{ type: "web_search_20260209", name: "web_search", max_uses: 5 }`, used only by adventure-planner and spread-the-magic.
- **SDK 1.x / API version `2026-10-21`.** Before writing any SDK call, read https://platform.claude.com/docs/en/api/migration-2026-10-21 and the claude-api skill's `typescript/claude-api/README.md` and `streaming.md`. Where they differ, the migration guide wins.
- No Disney logos, characters, Mickey shapes or real landmarks in any asset or copy. The castle must be generic.
- UI copy: sentence case, warm, no AI jargon ("assistant", "draft" are fine; "prompt", "model", "token", "AI" are not).
- Palette: purple `#7B3F99`, lavender `#F2DFFC`, cream `#FFFBF5`, ink `#2C3333`, night `#1F2560`, gold `#F3D58A` / `#C9A43B`, castle pink `#F4C6DA`, roof blue `#5B7FD6`.
- Fonts (Google Fonts): Fraunces (italic for headings), Wix Madefor Text (body), Princess Sofia (greeting only).
- Request bodies, form fields and drafts are never logged (no `console.log` of request or response content).
- Brains never invent MMV or EarMarked rules, prices or availability. Unknowns are written as `<!-- TODO(Jillian): … -->`.
- Legal footer, verbatim from her site: `As to Disney artwork, logos, and properties: © Disney. Universal elements and all related indicia TM & © Universal Studios. Jillian Jochum is an Independent Contractor affiliated with Magical Moments Vacations, an Authorized Disney Vacation Planner. Not an employee of The Walt Disney Company or Universal Destinations & Experiences.`

## Review Focus

1. **Real travel numbers in pasted text must not be blocked.** Disney confirmation numbers (8 digits), Royal Caribbean booking numbers (7 digits), phone numbers, dates and zip codes all pass. Only Luhn-valid 13–19-digit runs, SSN-formatted numbers and keyword-anchored passport numbers are blocked. Tests are in Task 2.
2. **A web search goes quiet for over 100 s, and Cloudflare drops the connection.** The Worker emits `: keepalive` every 15 s. Tested with fake timers in Task 6.
3. **Refining a long draft several times makes the request too big.** The limit is 5 refinements and 60,000 characters in total. Over that, the response is 413 with a friendly message, and the UI offers **Start over**. Tests are in Task 6.
4. **Jillian clicks Draft twice, or leaves the page mid-draft.** Draft is disabled while streaming. Leaving or **Start over** aborts the fetch through an `AbortController`. Tested in Task 7 (`streamDraft` honors abort).
5. **Welcome Center runs before Jillian has filled in her fit rules.** The verdict reads "not enough fit rules yet", never a guessed budget. In Task 5, a test checks that `fit-rules.md` is included for welcome-center. The rule is in the welcome-center skill text (Task 4).

---

## File map

```
package.json, tsconfig.json, tsconfig.app.json, tsconfig.worker.json, tsconfig.node.json
vite.config.ts            react() + cloudflare(); vitest config inline (environment "node")
wrangler.jsonc            name "magical-assistant", main "worker/index.ts", compatibility_date "2026-10-01",
                          assets { not_found_handling: "single-page-application", run_worker_first: ["/api/*"] },
                          vars { ACCESS_MODE: "on", TEAM_DOMAIN: "", POLICY_AUD: "" }
.dev.vars.example         ANTHROPIC_API_KEY=sk-ant-...   ACCESS_MODE=off
index.html                loads Google Fonts, mounts #root
shared/guard.ts           sensitive-data detection + contact masking
shared/tools.ts           tool + form-field definitions (UI and Worker validation)
shared/sse.ts             encode/parse the browser<->Worker SSE protocol
shared/sections.ts        split a draft into client text / internal notes / day blocks
brains/reference/{voice,business,compliance,booking-windows,fit-rules}.md
brains/skills/{magic-mail,welcome-center,spread-the-magic,adventure-planner}/SKILL.md
worker/brains.ts          ?raw imports of every brains file -> Record<string,string>
worker/prompt.ts          system blocks + user message
worker/access.ts          Cloudflare Access JWT check
worker/draft.ts           POST /api/draft handler (validation, guard, Claude stream, SSE)
worker/index.ts           fetch entry: routes /api/draft, else 404 JSON
src/main.tsx, src/App.tsx hash routing: "#/" home, "#/<toolId>" tool page
src/theme.css             palette tokens, fonts, layout
src/art/FireworksNight.tsx, src/art/CastleAtDusk.tsx   inline SVG headers (from the approved mockups)
src/pages/Home.tsx, src/pages/ToolPage.tsx
src/components/{ToolForm,DraftPanel,Sparkles,CopyButton}.tsx
src/lib/{greeting,streamDraft,markdown,clipboard}.ts
scripts/build-plugin.mjs  brains -> plugin/magical-vacations/ + dist-plugin/magical-vacations.zip; --check mode
.claude-plugin/marketplace.json
.github/workflows/plugin.yml
docs/MAINTAINING.md, README.md
tests/*.test.ts           one file per unit (named below)
```

---

### Task 1: Project skeleton

**Files:** create everything in the file map down to `index.html`, plus `worker/index.ts` (stub), `src/main.tsx` and `src/App.tsx` (a stub that renders "Magical Vacations"). The `package.json` scripts are:
- `dev: vite`
- `build: tsc -b && vite build`
- `test: vitest run`
- `typecheck: tsc -b`
- `cf-typegen: wrangler types`
- `deploy: npm run build && wrangler deploy`
- `build:plugin: node scripts/build-plugin.mjs`

The project is hand-written rather than generated with C3, because C3 can't scaffold into a non-empty repo without prompts. The result matches C3's React template: `@cloudflare/vite-plugin`, a SPA asset config and `worker/` as `main`.

**Interfaces:**
- Produces: `Env` (from `wrangler types` → `worker-configuration.d.ts`) with `ANTHROPIC_API_KEY: string`, `ACCESS_MODE: string`, `TEAM_DOMAIN: string`, `POLICY_AUD: string`. Vitest runs `tests/**/*.test.ts` in node.

- [ ] **Step 1:** Write the config files and stubs. `worker/index.ts` returns `Response.json({ error: "not found" }, { status: 404 })` for every `/api/*` path.
- [ ] **Step 2:** Run `npm install` and `npx wrangler types`. Expected: `worker-configuration.d.ts` is created and declares the four `Env` keys.
- [ ] **Step 3:** Run `npm run build`. Expected: exits 0 and writes `dist/`.
- [ ] **Step 4:** Run `npx vitest run --passWithNoTests`. Expected: exits 0.
- [ ] **Step 5:** Commit: `chore: scaffold Worker + React + Vite project`.

### Task 2: Sensitive-data guard (`shared/guard.ts`)

**Interfaces:**
- Produces:
  - `type SensitiveKind = "card" | "ssn" | "passport"`
  - `findSensitive(text: string): SensitiveKind[]` (unique kinds found)
  - `maskContacts(text: string): { text: string; emails: number; phones: number }`
  - `luhnValid(digits: string): boolean`

- [ ] **Step 1: Write failing tests** in `tests/guard.test.ts`:
```ts
expect(findSensitive("Visa 4111 1111 1111 1111 exp 12/28")).toEqual(["card"]);
expect(findSensitive("card 4111-1111-1111-1111")).toEqual(["card"]);
expect(findSensitive("Amex 378282246310005")).toEqual(["card"]);
expect(findSensitive("4111 1111 1111 1112")).toEqual([]);            // fails Luhn
expect(findSensitive("Disney confirmation 12345678, RCI booking 1234567")).toEqual([]);
expect(findSensitive("Call 555-123-4567 or (555) 123-4567, zip 32830-1000")).toEqual([]);
expect(findSensitive("Trip 2026-12-14 to 2026-12-20")).toEqual([]);
expect(findSensitive("SSN 123-45-6789")).toEqual(["ssn"]);
expect(findSensitive("passport number: 567891234")).toEqual(["passport"]);
expect(findSensitive("passport expires June 2027")).toEqual([]);
const m = maskContacts("Mom: amy@example.com, cell (407) 555-0199 or +1 407 555 0100; conf 12345678");
expect(m.text).toBe("Mom: [email], cell [phone] or [phone]; conf 12345678");
expect(m.emails).toBe(1); expect(m.phones).toBe(2);
expect(maskContacts(m.text).text).toBe(m.text);                    // idempotent
```
- [ ] **Step 2:** Run `npx vitest run tests/guard.test.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement.**
  - Cards: find runs of 13–19 digits, allowing single spaces or dashes between digits, strip the separators, and flag the run when `luhnValid` passes.
  - SSN: `\b\d{3}-\d{2}-\d{4}\b`, or "ssn" / "social security" followed within 20 characters by 9 digits.
  - Passport: "passport" (case-insensitive) followed within 25 characters by a 6–9 character alphanumeric token that contains at least 6 digits.
  - Phones are masked only when formatted: parentheses, separators or a leading `+1`. A bare 10-digit run is left alone (it could be a confirmation number).
- [ ] **Step 4:** Run `npx vitest run tests/guard.test.ts`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: sensitive-data guard and contact masking`.

### Task 3: Shared definitions: tools, SSE codec, draft sections

**Interfaces:**
- Produces, in `shared/tools.ts`:
  - `type ToolId = "magic-mail" | "welcome-center" | "spread-the-magic" | "adventure-planner"`
  - `interface FieldDef { id: string; label: string; kind: "text" | "textarea" | "select"; options?: string[]; required?: boolean; placeholder?: string; maxLength: number }`
  - `interface ToolDef { id: ToolId; name: string; subtitle: string; icon: string; effort: "medium" | "high"; webSearch: boolean; notesFirst: boolean; fields: FieldDef[] }`
  - `const TOOLS: Record<ToolId, ToolDef>`
  - `isToolId(x: unknown): x is ToolId`
  - `interface DraftRequest { tool: ToolId; fields: Record<string, string>; refinements?: { draft: string; request: string }[] }`, the request body that the UI (Task 7) and the Worker (Task 6) share
- Produces, in `shared/sse.ts`:
  - `type ServerEvent = { event: "text"; data: string } | { event: "status"; data: { phase: "searching" | "writing" } } | { event: "done"; data: { stopReason: string; sources: { title: string; url: string }[] } } | { event: "error"; data: { message: string } }`
  - `encodeEvent(e: ServerEvent): string`
  - `KEEPALIVE = ": keepalive\n\n"`
  - `class EventParser { push(chunk: string): ServerEvent[] }`, which buffers partial frames and ignores comment lines.
- Produces, in `shared/sections.ts`:
  - `splitDraft(md: string): { client: string; internal: string; days: { title: string; body: string }[] }`. The text after a line `## For Jillian only` is `internal`; everything before it is `client`. `days` are the `### Day …` blocks inside `client`.

Tool field values (exact):

| id | name | subtitle | icon (Tabler) | effort | webSearch | notesFirst | fields (id: label, kind, maxLength; * = required) |
|---|---|---|---|---|---|---|---|
| magic-mail | Magic Mail | Client emails | mail-heart | medium | false | false | emailType*: "Which email?", select [Welcome, Payment reminder, Pre-trip, Welcome home, Something else], 40 · clientNames*: "Client names", text, 200 · trip: "Destination and dates", text, 300 · details: "Anything to include", textarea, 4000 |
| welcome-center | Welcome Center | Review a new inquiry | door-enter | medium | false | true | inquiry*: "Paste the inquiry or Fillout submission", textarea, 12000 |
| spread-the-magic | Spread the Magic | Marketing posts | wand | medium | true | false | channel*: "Where will it go?", select [Facebook post, Instagram caption, Newsletter, Website promo], 40 · topic*: "What's it about?", text, 300 · promo: "Promotion details (if any)", textarea, 4000 |
| adventure-planner | Adventure Planner | Trip plans | map-2 | high | true | false | destination*: "Destination", select [Walt Disney World, Universal Orlando, Royal Caribbean cruise, All-inclusive resort], 60 · dates*: "Travel dates", text, 200 · party*: "Who's going (ages)", text, 300 · resort: "Resort or ship", text, 200 · priorities: "Must-dos and priorities", textarea, 4000 |

- [ ] **Step 1: Write failing tests**:
  - `tests/sse.test.ts`: encoding then parsing every `ServerEvent` variant round-trips. A frame split across two `push` calls is returned once. `KEEPALIVE` produces no events.
  - `tests/sections.test.ts`:
    - `splitDraft("Hi!\n\n## For Jillian only\n- verify price")` → `client: "Hi!"`, `internal: "- verify price"`.
    - With no marker, `internal` is `""`.
    - `"### Day 1 — Magic Kingdom\nRope drop\n### Day 2 — EPCOT\nSoarin"` → two `days` with those titles and bodies.
  - `tests/tools.test.ts`: every tool has at least one required field. `isToolId("nope")` is false.
- [ ] **Step 2:** Run `npx vitest run tests/sse.test.ts tests/sections.test.ts tests/tools.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the three modules. SSE frames are `event: <name>\ndata: <JSON>\n\n`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: shared tool definitions, SSE codec, draft section parser`.

### Task 4: Brains (reference pack and four skills)

**Files:** `brains/reference/*.md`, `brains/skills/*/SKILL.md`.

**Interfaces:**
- Produces:
  - Each `SKILL.md` has YAML frontmatter with **only** `name` (equal to the folder name) and `description` (≤ 1,024 characters, trigger phrase first).
  - The body names the reference files it needs as literal paths `references/<file>.md`. Tasks 5 and 8 discover references by matching `references/([a-z-]+)\.md` in the body.
- Required references:
  - magic-mail: voice, business, compliance
  - welcome-center: voice, business, compliance, fit-rules
  - spread-the-magic: voice, business, compliance
  - adventure-planner: voice, business, compliance, booking-windows

Content requirements (seed only from her website and the spec, and mark the rest TODO):
- **voice.md:**
  - Tone: warm, patient, enthusiastic, family-first, plain words, light sparkle without gushing. (Her testimonials stress patience, tips and tricks, and responsiveness.)
  - Signature block: Jillian Jochum / Magical Moments Vacations / jillian.jochum@mmvagent.com.
  - TODO for 2–3 real sample emails.
- **business.md:**
  - Who she is and where she travels (Disney World, Universal Orlando, luxury cruises).
  - Planning tiers, quoted from her site: "Magical Vacations", where she handles booking, tickets and transportation, and "Concierge", with 24/7 support and custom itinerary design.
  - The complimentary Vacation Blueprint Call. Her site says 30 minutes and the email says 20, so add a TODO to confirm.
  - Facebook `MMVbyJillian`, Instagram `@mmvbyjillian`.
  - TODO for the booking-call link and the payment-reminder schedule.
- **compliance.md:**
  - The verbatim footer (Global Constraints).
  - Name format: "Jillian Jochum, Independent Contractor affiliated with Magical Moments Vacations".
  - Never use Disney or Universal logos or characters.
  - Never state a price, discount or availability as fact without the words "verify before quoting".
  - TODO for the MMV brand guide and EarMarked rules.
- **booking-windows.md:**
  - A table with columns: what, window, "last checked". Rows: Disney dining, Lightning Lane (on-site versus off-site), Universal Express, and the Royal Caribbean Cruise Planner.
  - Every window is marked "verify — last checked: not yet". No numbers are stated as current fact.
- **fit-rules.md:** headings for minimum budget by destination, destinations she does and doesn't book, minimum lead time, and planning fee by tier. All are TODO.
- **Every skill body includes:**
  - The output format, with client-facing text first, then a line `## For Jillian only` followed by internal notes.
  - "If key details are missing, ask for them before drafting."
  - "Never include or repeat card numbers. If you see one, stop and say so."
  - "Never invent prices, availability or policies; mark anything time-sensitive 'verify before quoting'."
- **Per-skill extras:**
  - **magic-mail:** a first line `**Subject:** …`, and the email ends with the signature block and footer.
  - **welcome-center:**
    - The client part is a suggested reply: an invite to book the Blueprint call, or a kind redirect.
    - Internal notes hold the verdict (Great fit / Maybe / Not a fit) with reasons, a budget reality check and 5–8 Blueprint-call questions.
    - If `fit-rules.md` still has TODOs, the verdict is "not enough fit rules yet".
    - Never put dollar amounts in the reply.
  - **spread-the-magic:**
    - Internal notes hold a compliance checklist (footer, name format, no logos or characters, no unverified claims) and hashtags.
    - Web search is used only to confirm a named promotion, with sources cited.
  - **adventure-planner:**
    - The client part is `### Day N — <title>` blocks, plain text with no tables, ready for Travefy.
    - Internal notes hold the verify flags, booking-window reminders and sources.

- [ ] **Step 1:** Write the 5 reference files and 4 skills.
- [ ] **Step 2:** Verify with `grep -L "## For Jillian only" brains/skills/*/SKILL.md`. Expected: no output.
- [ ] **Step 3:** Commit: `feat: brains — reference pack and four skills`.

### Task 5: Prompt builder (`worker/brains.ts`, `worker/prompt.ts`)

**Interfaces:**
- Consumes: `ToolId` and `TOOLS` (Task 3).
- Produces:
  - `BRAINS: Record<string, string>`, keyed `reference/<name>` and `skills/<toolId>`, with raw file text.
  - `stripFrontmatter(md: string): string`.
  - `skillReferences(skillBody: string): string[]` (unique, in order).
  - `buildSystem(tool: ToolId): Anthropic.TextBlockParam[]`. It returns exactly 2 blocks:
    - [0] the voice, business and compliance text joined with `\n\n---\n\n`;
    - [1] the extra references plus the skill body. This block carries `cache_control: { type: "ephemeral" }`, and the block also includes the line "You are drafting for Jillian Jochum's travel business." from the skill.
  - `buildUserMessage(tool: ToolId, fields: Record<string, string>): string`. One `**<label>:** <value>` line per non-empty field, in `TOOLS` order.

- [ ] **Step 1: Write failing tests** in `tests/prompt.test.ts`:
  - `stripFrontmatter("---\nname: x\n---\nBody")` returns `"Body"`.
  - `skillReferences` of the welcome-center body includes `"fit-rules"`.
  - `buildSystem("welcome-center")[1].text` contains the text of `fit-rules.md`.
  - `buildSystem("magic-mail")[1].text` does not contain the text of `booking-windows.md`.
  - Neither block contains `"name: "` frontmatter.
  - `JSON.stringify(buildSystem(t))` is identical across two calls for every tool (byte-stable).
  - `buildUserMessage("magic-mail", { clientNames: "The Smiths", emailType: "Welcome" })` returns `"**Which email?:** Welcome\n**Client names:** The Smiths"`.
- [ ] **Step 2:** Run `npx vitest run tests/prompt.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement. `worker/brains.ts` uses static `import x from "../brains/…?raw"` lines, because Vite and Vitest both resolve `?raw`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: system prompt builder from brains`.

### Task 6: Draft API (`worker/access.ts`, `worker/draft.ts`, `worker/index.ts`)

**Interfaces:**
- Consumes: the guard (Task 2), `TOOLS`, `encodeEvent` and `KEEPALIVE` (Task 3), and `buildSystem` and `buildUserMessage` (Task 5).
- Produces:
  - `verifyAccess(request: Request, env: Env): Promise<{ email: string } | Response>`.
    - With `ACCESS_MODE === "off"`, it returns `{ email: "local" }`.
    - Otherwise it verifies the `Cf-Access-Jwt-Assertion` header with `jose` `createRemoteJWKSet(new URL(TEAM_DOMAIN + "/cdn-cgi/access/certs"))` and `jwtVerify(token, jwks, { issuer: TEAM_DOMAIN, audience: POLICY_AUD })`.
    - It fails closed: a 500 with "Login isn't set up yet" if `TEAM_DOMAIN` or `POLICY_AUD` is empty, and a 401 if the token is missing or invalid.
  - `handleDraft(request: Request, env: Env, makeClient?: (env: Env) => Anthropic, keepaliveMs?: number): Promise<Response>`. `keepaliveMs` defaults to 15000.
  - Response codes:
    - **200:** a `text/event-stream` of `ServerEvent`s.
    - **400:** JSON `{ error }` for an unknown tool, a missing required field, an over-length field, a non-object body, or `findSensitive` hits. The error copy is "That looks like a card number — please remove it. Card details never go into the assistant."
    - **413:** more than 5 refinements, or more than 60,000 characters in total.
  - Messages sent to Claude:
    - The user message comes from `buildUserMessage` applied to the `maskContacts`-ed fields.
    - Each refinement then adds an `assistant` turn (the draft) and a `user` turn (the request), with the request masked too.
  - Event mapping: text deltas → `text`. A `server_tool_use` block start → `status: searching`, and the next text block → `status: writing`.
  - Turn handling:
    - On `stop_reason === "pause_turn"`, append the assistant content and re-stream, at most 3 times.
    - At the end, emit `done` with `stopReason` and `sources`. Sources are unique `{title, url}` taken from text-block citations, falling back to `web_search_result` items.
  - Error copy (emitted as an `error` event, or as JSON if the stream hasn't started):
    - SDK auth error: "The assistant isn't connected yet (API key)."
    - Rate limit: "It's busy right now — try again in a minute."
    - Connection error: "Couldn't reach the assistant — check the internet connection."
    - Anything else: "Something went wrong — try again."
  - `worker/index.ts`: `POST /api/draft` → `verifyAccess`, then `handleDraft`. Other `/api/*` → 404 JSON.

- [ ] **Step 1: Write failing tests** in `tests/draft.test.ts`, with a fake `makeClient` whose `messages.stream` / `beta.messages.stream` returns scripted event sequences and `finalMessage()`. Use whichever call shape the SDK 1.x docs prescribe for betas.
  - An unknown tool, or a missing `clientNames` for magic-mail, returns 400.
  - A field containing `4111 1111 1111 1111` returns 400, and the fake client is never called.
  - Six refinements return 413.
  - A scripted stream of "Hello", " there" with `end_turn` gives a body that parses (with `EventParser`) to `text "Hello"`, `text " there"`, then `done {stopReason:"end_turn"}`.
  - The first stream ends with `pause_turn` and the second with `end_turn`: the client is called twice, the second call's messages end with the paused assistant content, and there is exactly one `done`.
  - A `refusal` stop gives `done {stopReason:"refusal"}`.
  - The request passed to the client has `model: "claude-opus-5-5"`, `output_config.effort: "high"` and a `tools` entry with `type "web_search_20260209"` for adventure-planner; magic-mail has effort `"medium"` and no tools.
  - An email in `details` reaches the client as `[email]`.
  - With fake timers (`keepaliveMs: 15000`), a stream that stays silent for 31 s writes `KEEPALIVE` at least twice.
  - `tests/access.test.ts`: with `ACCESS_MODE "off"`, it returns `{email:"local"}`. With `"on"` and an empty `TEAM_DOMAIN`, the response status is 500. With `"on"` and no header, the response status is 401.
- [ ] **Step 2:** Run `npx vitest run tests/draft.test.ts tests/access.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the three files. Stream through a `TransformStream`, write `KEEPALIVE` with `setInterval` and clear it on finish or abort, and never log content.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Run `npm run typecheck`. Expected: exits 0.
- [ ] **Step 6:** Commit: `feat: /api/draft — streaming Claude call with guards and Access check`.

### Task 7: UI

**Interfaces:**
- Consumes: `TOOLS` and `FieldDef`, `EventParser` and `ServerEvent`, `splitDraft`, `findSensitive` and `maskContacts`.
- Produces:
  - `greeting(d: Date): "Good morning" | "Good afternoon" | "Good evening"`, with boundaries at 12:00 and 17:00.
  - `streamDraft(body: DraftRequest, on: { text(t: string): void; status(p: "searching" | "writing"): void; done(d: {stopReason: string; sources: {title: string; url: string}[]}): void; error(msg: string): void }, signal: AbortSignal): Promise<void>`. A non-200 response → `on.error(json.error)`. An abort ends quietly.
  - `renderMarkdown(md: string): string` (marked + DOMPurify).
  - `copyRich(html: string, text: string): Promise<void>`. It uses `ClipboardItem` with `text/html` and `text/plain`, falls back to `navigator.clipboard.writeText(text)`, and then to a hidden textarea with `execCommand("copy")`.

Screens (from the approved mockups):
- **Home:**
  - `FireworksNight` header SVG: night sky, gold, pink and lavender bursts, a generic pink castle with blue roofs, and the greeting `${greeting(now)}, Jillian` in Princess Sofia gold.
  - A 4-tile grid on lavender. Each cream tile shows the Tabler icon, the Fraunces italic name in purple and the subtitle. Clicking a tile goes to `#/<id>`.
  - Tabler icons come from the `@tabler/icons-webfont` package.
- **ToolPage:**
  - A `CastleAtDusk` banner (lavender sky, purple castle, gold dotted pixie-dust trail) holding the tool name and a "← All tools" link.
  - Two columns at ≥ 900 px wide, stacked below that.
  - **Left:** `ToolForm` with the labelled fields from `TOOLS` and the **Draft** button (disabled while streaming).
    - Before sending, `findSensitive` hits show the card-number message inline, and nothing is sent.
    - `maskContacts` counts above 0 show "Hid 1 email and 2 phone numbers — they aren't needed for the draft."
  - **Right:** `DraftPanel`.
    - While waiting, it shows `Sparkles` and "Sprinkling pixie dust…" ("Checking the latest info…" while searching).
    - The streamed text is rendered through `splitDraft`. The client text goes in a cream card with **Copy**. Each `days[]` block gets a **Copy day** button.
    - The internal notes go in a lavender "For Jillian only" card, placed above the client card when `notesFirst`. Sources are listed under that card.
    - Below sit a refine input ("Make it shorter, warmer, add…") with a **Refine** button, and **Start over**.
    - `refusal` → "I can't help with that one — try rewording." `max_tokens` → "That got long — try asking for less."
  - `Sparkles` respects `prefers-reduced-motion` (static sparkles, no animation).

- [ ] **Step 1: Write failing tests**:
  - `tests/greeting.test.ts`: 09:00 → morning, 12:00 → afternoon, 16:59 → afternoon, 17:00 → evening.
  - `tests/streamDraft.test.ts`, with a stubbed `fetch`:
    - A 200 SSE body calls `text` then `done`.
    - A 400 JSON `{error:"x"}` calls `error("x")`.
    - Aborting the signal mid-stream resolves without calling `error`.
- [ ] **Step 2:** Run `npx vitest run tests/greeting.test.ts tests/streamDraft.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `src/lib/*`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Implement the theme, art, pages and components.
- [ ] **Step 6:** Run `npm run dev` with `.dev.vars` set (`ACCESS_MODE=off`, a real key). In the built-in browser at 1440×900, check:
  - The home screen matches the mockup.
  - Each tool page renders.
  - A magic-mail draft streams in and shows the Subject line, signature and footer.
  - Pasting `4111 1111 1111 1111` shows the inline block and makes no `/api/draft` request (check the Network tab).
  - Reduced-motion emulation stops the sparkle animation.
- [ ] **Step 7:** Commit: `feat: storybook UI — home, tool pages, streaming draft panel`.

### Task 8: Plugin build, marketplace, auto-rebuild

**Interfaces:**
- Consumes: the `brains/` layout and the `references/<name>.md` convention (Task 4).
- Produces: `node scripts/build-plugin.mjs [--check]`.
  - It writes `plugin/magical-vacations/.claude-plugin/plugin.json` with these fields:
    - `{ name: "magical-vacations", displayName: "Magical Vacations by Jillian", version: "1.0.N", description: "Drafting helpers for Jillian Jochum's travel business: client emails, inquiry review, compliant marketing posts and trip plans.", author: { name: "Michael Jochum" } }`.
  - It writes `skills/<id>/SKILL.md`, copied unchanged.
  - It writes `skills/<id>/references/<ref>.md` for each reference the skill names.
  - It writes `dist-plugin/magical-vacations.zip` (with `fflate` `zipSync`; the plugin folder's contents sit at the zip root, so `.claude-plugin/plugin.json` is a top-level entry).
  - `N` increments only when any generated skill or reference file differs from what's on disk. It starts at 1.
  - `--check` writes nothing and exits 1 with a list of out-of-date files if `plugin/` is stale.
- Also produces:
  - `.claude-plugin/marketplace.json`: `{ name: "magical-vacations-marketplace", owner: { name: "Michael Jochum" }, plugins: [{ name: "magical-vacations", source: "./plugin/magical-vacations", description: <same as above> }] }`.
  - `.github/workflows/plugin.yml`:
    - It triggers on push to `main` with paths `brains/**` and `scripts/build-plugin.mjs`, with `permissions: contents: write`.
    - Steps: checkout, setup-node 22 with npm cache, `npm ci`, `npm run build:plugin`.
    - If `git status --porcelain plugin` is non-empty, it commits "chore: rebuild Claude plugin" as `github-actions[bot]` and pushes.

- [ ] **Step 1: Write failing test** `tests/plugin.test.ts`:
  - Run the script with `--check` through `child_process.spawnSync("node", ["scripts/build-plugin.mjs", "--check"])`. Expected: status 0 after a build.
  - The generated `skills/welcome-center/references/fit-rules.md` equals `brains/reference/fit-rules.md`.
  - Every generated `SKILL.md` frontmatter has only the keys `name` and `description`.
- [ ] **Step 2:** Run `npx vitest run tests/plugin.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the script, `marketplace.json` and the workflow, then run `npm run build:plugin`.
- [ ] **Step 4:** Run `npx vitest run tests/plugin.test.ts`. Expected: PASS. Then edit one brains file and run `node scripts/build-plugin.mjs --check`. Expected: exit 1, naming the file. Revert the edit.
- [ ] **Step 5:** Commit: `feat: Claude plugin build, marketplace manifest, auto-rebuild workflow`.

### Task 9: Docs and final verification

**Files:**
- `README.md`, for a developer: setup, `.dev.vars`, scripts and deploy steps. The deploy steps are:
  1. `wrangler login`.
  2. `wrangler secret put ANTHROPIC_API_KEY`.
  3. `npm run deploy`.
  4. Enable Access in the dashboard, add the One-time PIN identity provider, and paste `TEAM_DOMAIN` and `POLICY_AUD` into `wrangler.jsonc` vars.
  5. Connect Workers Builds.
  6. Set the Anthropic Console spend limit to $25 a month.
- `docs/MAINTAINING.md`, for the non-technical maintainer:
  - Which `brains/` file controls what.
  - How to edit a file on github.com (pencil icon → commit).
  - That the site redeploys and the plugin rebuilds on their own, in about 2 minutes.
  - How Jillian installs or updates the plugin: zip upload, or **Add marketplace** with **Sync automatically**, then start a new chat.
  - How to add a person to the Access list.
  - What never to paste (card numbers).

- [ ] **Step 1:** Write both docs.
- [ ] **Step 2:** Run `npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 3:** Commit: `docs: README and maintainer guide`.
