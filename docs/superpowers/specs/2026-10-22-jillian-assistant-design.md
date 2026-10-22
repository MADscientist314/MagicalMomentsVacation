# Magical Vacations by Jillian: Claude-powered assistant

## Context

Someone helping Jillian emailed Michael (`Magical moments Vacation.eml`) asking for help building "an agent" for Jillian Jochum, an independent travel advisor affiliated with Magical Moments Vacations (MMV, an Authorized Disney Vacation Planner). Jillian works alone on a single-screen Mac and does nearly everything herself: marketing, intake, research, proposals, bookings, concierge work and client communication. She is not keen on AI. The person who emailed wants something very simple that they can maintain and use to help with marketing, and that Jillian will actually use.

Michael wants a working assistant, not just a proposal: a **Disney-feeling website** that calls the **Claude API in the cloud**, whose brains can also be installed as a **standalone Claude app plugin**.

The project folder `D:\github\JJochum\MagicalMomentsVacation` is empty apart from the email, so this is greenfield.

## Decisions
**Michael decided:**
- A working assistant, not a proposal.
- All four jobs in v1.
- A website with a magical, Disney-feeling theme, calling the Claude API in the cloud, with the option of a standalone Claude app plugin.
- The "Storybook" look made more Disney, mixing the two mockups.
- The maintainer edits GitHub text files.

**My calls (listed so you can veto them):**
- Cloudflare (Workers Paid $5/month plus Access), TypeScript, React and Vite.
- Model `claude-opus-5-5`, with server-side refusal fallback turned on.
- Masking contact details and blocking card numbers.
- Skills that stand on their own.
- Travefy day blocks.
- Fireworks night on the home screen, castle at dusk on tool pages.

## What gets built (v1)

Four tools. Each is a short form, a **Draft** button and a copyable result. Jillian reviews and sends everything herself.

| Tool (UI name) | Plain subtitle | Input | Output |
|---|---|---|---|
| **Magic Mail** | Client emails | Email type (welcome, payment reminder, pre-trip, welcome home, other), client names, destination and dates, key details | An email in Jillian's voice with a subject line, ending in her signature and footer |
| **Welcome Center** | Review a new inquiry | A pasted Fillout submission or inquiry email | A fit verdict (great fit, maybe, not a fit) with reasons, a budget reality check, 5–8 questions for the Blueprint call, and a suggested reply (invite to book the call, or a kind redirect) |
| **Spread the Magic** | Marketing posts | Channel (Facebook, Instagram, newsletter, website promo), topic, any promotion details | The draft post, a compliance checklist (legal footer, approved name format, no Disney logos or characters, no unverified claims) and suggested hashtags |
| **Adventure Planner** | Trip plans | Destination (Disney World, Universal, Royal Caribbean, all-inclusive), dates, party and ages, resort, priorities | A day-by-day plan formatted to paste into Travefy, dining and Lightning Lane or Express strategy, booking-window reminders, and sources. Prices and availability are flagged "verify before quoting." Uses web search. |

After a draft appears, there's one refine box ("make it shorter", "warmer", "add the dining time") plus **Copy** and **Start over**.

### Non-goals and hard limits
- The assistant never books anything and never touches payments, ClientEase or Gusto. There's no client database and no stored history: every request stands alone.
- **Card numbers are never sent.** A Luhn check runs in both the browser and the Worker on any run of 13–19 digits. Anything that looks like a card number is blocked with a friendly message.
- No Disney logos, characters, Mickey shapes or real park landmarks anywhere in the UI. The Disney feel comes from color, sparkles, fireworks, a generic fairytale castle, a storybook script and park-style tool names. (MMV and EarMarked compliance: anything she screenshots for a client counts as marketing.)
- The assistant never invents MMV or EarMarked rules. The compliance checker only applies rules written in `brains/reference/compliance.md`.

### Anti-goals (a failure even if it technically works)
- Jillian has to "prompt-engineer" or babysit it.
- A made-up price, availability or policy reaches a client.
- Only Michael can change what it says.

## Look and feel (agreed: "Storybook", made more Disney, a mix of the two mockups)
- Palette from her Wix site: purple `#7B3F99`, lavender `#F2DFFC`, cream `#FFFBF5`, ink `#2C3333`. Additions: royal-blue night `#1F2560`, gold `#F3D58A` / `#C9A43B`, castle pink `#F4C6DA`, roof blue `#5B7FD6`.
- Fonts: **Fraunces** (italic; stands in for her site's Recoleta) for headings, **Wix Madefor Text** for body text (the same as her site), and **Princess Sofia** for the greeting only. All are from Google Fonts.
- **Home screen: "fireworks night."** A royal-blue sky header with gold, pink and lavender fireworks over a pink-and-blue generic castle (inline SVG), a time-of-day greeting ("Good morning, Jillian") and four cream tiles on lavender.
- **Tool pages: "castle at dusk."** A smaller lavender banner with a purple castle and a gold pixie-dust trail. Below it, two columns: the form on the left, the draft on the right (sized for a single Mac screen).
- Waiting state: animated sparkles with "Sprinkling pixie dust…" (honors `prefers-reduced-motion`).
- Copy rules: plain, warm, sentence case, with no AI jargon anywhere in the UI.

## Architecture (my call unless noted; Michael didn't object to these)

**Language: TypeScript.** It's a single package at the repo root.

```
MagicalMomentsVacation/
  brains/                         ← single source of truth (plain Markdown)
    reference/
      voice.md                    Jillian's tone, sign-off, signature; sample emails (TODO from Jillian)
      business.md                 who she is, planning tiers, services, contact, booking-call link
      compliance.md               exact legal footer (from her site), name format, MMV/EarMarked rules (TODO from MMV guide)
      booking-windows.md          dining/LL/Express/cruise windows cheat sheet with "last checked" date
    skills/
      magic-mail/SKILL.md
      welcome-center/SKILL.md
      spread-the-magic/SKILL.md
      adventure-planner/SKILL.md
  src/                            React UI (Vite)
    pages/Home.tsx, pages/Tool.tsx
    tools.ts                      per-tool form field definitions + display names
    components/ (Header art SVGs, ToolForm, DraftPanel, Sparkles, CopyButton)
    lib/cardGuard.ts              Luhn detector shared with the Worker
  worker/
    index.ts                      /api/draft route (POST), static assets for everything else
    prompt.ts                     builds system prompt from brains (Vite ?raw imports, frontmatter stripped)
    access.ts                     verifies Cloudflare Access JWT (Cf-Access-Jwt-Assertion)
  scripts/build-plugin.mjs        brains/ → plugin/magical-vacations/ (committed) + dist-plugin/magical-vacations.zip
  plugin/magical-vacations/       GENERATED Claude plugin (don't edit by hand)
  .claude-plugin/marketplace.json lets the Claude app add this repo as a plugin marketplace
  .github/workflows/plugin.yml    rebuilds + commits plugin/ when brains/** changes
  wrangler.jsonc, vite.config.ts, package.json, tsconfig*.json
  docs/MAINTAINING.md             how to edit brains on GitHub, rebuild the plugin, rotate the key
  docs/superpowers/specs/2026-10-22-jillian-assistant-design.md   (this design, saved on approval)
```

**Hosting:** a Cloudflare Worker with static assets (Cloudflare now recommends Workers over Pages for new projects). It's scaffolded with `npm create cloudflare@latest -- magical-assistant --framework=react`, which uses the Cloudflare Vite plugin. In `wrangler.jsonc`:
- `assets.not_found_handling: "single-page-application"`
- `run_worker_first: ["/api/*"]`
- a compatibility date of 2026-08-04 or later, so Node.js compatibility is on by default.

The API key is a Worker secret (`wrangler secret put ANTHROPIC_API_KEY`); locally it lives in `.dev.vars`, which is gitignored. Auto-deploy comes from GitHub through Workers Builds; the Worker name must match `name` in `wrangler.jsonc`.
- **Plan: Workers Paid ($5/month), my call.** The Free plan's 10 ms CPU cap per request is too tight for parsing a 30–120 s stream.
- **URL:** the `*.workers.dev` address behind Access for v1. Cloudflare calls workers.dev "for personal or hobby projects," which is fine for a two-person internal tool. A custom domain is a later option; her Wix DNS would need a Cloudflare zone for it.

**Login:** Cloudflare Access (Zero Trust Free: $0 and up to 50 users, though it needs a card on file). Turn it on with **Worker → Settings → Domains & Routes → Enable Cloudflare Access**, then allow only Jillian's and the maintainer's email addresses.
- Add the **One-time PIN** identity provider (Zero Trust → Integrations → Identity providers), so they sign in with an emailed code, not a Cloudflare account.
- The Worker also checks the Access JWT on `/api/*` (with `jose`, using the `TEAM_DOMAIN` and `POLICY_AUD` that Cloudflare shows when Access is enabled), so the API can't be reached around Access.

**Claude API call (`worker/index.ts`):** this uses the official `@anthropic-ai/sdk` with `client.messages.stream(...)`. **The SDK just went to 1.x (1.1.0), along with a new API version `2026-10-21`.** Before writing the API code, read https://platform.claude.com/docs/en/api/migration-2026-10-21 and the `claude-api` skill's TypeScript README, and follow whichever is newer where they differ.
- Model `claude-opus-5-5` (the skill's default; switching to Sonnet 5.5 is Michael's call if cost matters). It uses adaptive thinking (no `thinking` param) and an explicit effort: `medium` for Magic Mail, Welcome Center and Spread the Magic, and `high` for Adventure Planner. `max_tokens` is 16000.
- Server-side refusal fallback is on: the beta `server-side-fallback-2026-07-01` with `fallbacks: "default"` (enabled by default per the API guidance; Michael can say to drop it).
- System prompt = `voice.md` + `business.md` + `compliance.md` (+ `booking-windows.md` for Adventure Planner) + that tool's `SKILL.md` body, with a `cache_control` breakpoint after the stable part. The user's form fields become one structured user message. A refine is sent as a second user turn with the prior draft as the assistant turn, so the client resends the history and nothing is stored server-side.
- Only Adventure Planner and Spread the Magic (for promotions) get `web_search_20260209` (`max_uses` 5). Handle `pause_turn` by re-sending, and branch on web-search error objects. Render citations as a "Sources" list.
- Check `stop_reason`: on `refusal` show "I can't help with that one, try rewording", and on `max_tokens` show a note.
- Streaming: the Worker passes text deltas to the browser as a plain `text/event-stream` and appends a final `done` event carrying sources and stop info. During silent stretches (thinking, web search) it sends an SSE comment heartbeat every 15 s, because Cloudflare is reported to drop connections that are silent for about 100 s. Request bodies and drafts are never logged.

**Rough cost:** an everyday draft is about 6k input tokens (mostly cached) plus about 1k output, a few cents each on Opus 5.5. A trip plan with searches is roughly $0.20–0.50. Set a monthly spend limit (for example $25) in the Anthropic Console workspace.

**Plugin (`scripts/build-plugin.mjs`), per Anthropic's current plugin docs:**
- **Output:** the script writes `plugin/magical-vacations/` with these pieces:
  - `.claude-plugin/plugin.json`, holding `name: "magical-vacations"` (permanent; must not start with `claude-`), `displayName: "Magical Vacations by Jillian"`, `version`, `description` and `author`.
  - `skills/<name>/SKILL.md` for each skill. Frontmatter may hold **only** `name` (matching the folder) and `description` (≤1,024 characters, trigger phrase first); claude.ai rejects other keys.
  - `skills/<name>/references/*.md`. The shared reference files are **copied into each skill's folder**, because skills can't reliably read across folders. The skill text points at them by relative path ("for tone, read `references/voice.md`").
- **Zip:** the script also writes `dist-plugin/magical-vacations.zip`.
- **Version:** bumped automatically on every build.
- **Install, route 1 (easiest for Jillian):** in the Claude app, **Customize → Plugins → Add → Upload plugin** with the zip. This needs a paid Claude plan (Pro or above); Cowork runs on Mac.
- **Install, route 2 (gets updates):** a repo-root `.claude-plugin/marketplace.json` whose `source` is `./plugin/magical-vacations`. In the app, **Customize → Plugins → Add → Add marketplace** with the GitHub repo, and turn on **Sync automatically**. A private repo needs the Claude GitHub App granted access.
- **Keeping it current:** a GitHub Action reruns `build:plugin` when `brains/**` changes and commits the regenerated `plugin/` folder, so the maintainer only ever edits `brains/`.
- **In the app:** skills appear in the `/` menu. A new chat session is needed to pick up an update.
- **Validation:** `claude plugin validate plugin/magical-vacations` before each release.

## Implementation steps
1. `git init`. Save this design to `docs/superpowers/specs/2026-10-22-jillian-assistant-design.md`. Add `.gitignore` (`node_modules`, `.dev.vars`, `dist*`, `.superpowers/`). Then break steps 2–8 into bite-sized tasks with `superpowers:writing-plans` before writing code.
2. Scaffold the Worker + React + Vite project with C3. Add `@anthropic-ai/sdk`, `jose`, `marked`, `dompurify` and Vitest.
3. Write `brains/`: the four `SKILL.md` files (frontmatter: `name` and `description`; the body holds the output format and rules) and the reference pack, seeded from her site (tiers, contact, exact footer text, booking-call wording, testimonials tone). Mark every unknown with `<!-- TODO(Jillian): … -->`. Never invent MMV or EarMarked rules or prices.
4. `worker/prompt.ts` and `worker/index.ts`: request validation (tool id allow-list, field length caps), the card guard, the Access JWT check, the streaming call, and handling of `pause_turn`, refusal and errors.
5. UI: theme tokens, header SVG art (fireworks night and castle at dusk, generic shapes), Home, Tool page driven by `tools.ts`, DraftPanel (sanitized markdown, Copy as rich text and plain text, refine box), Sparkles loader, time-of-day greeting, and friendly errors.
6. `scripts/build-plugin.mjs`, `npm run build:plugin`, `marketplace.json` and the GitHub Action. Add a Vitest check that `plugin/` matches `brains/`.
7. `docs/MAINTAINING.md`, written for the non-technical maintainer: edit a file in `brains/` on GitHub, and the site redeploys itself; rebuild the plugin zip; where the spend limit is; how to add a person to the Access list.
8. Deploy: set up Workers Builds, the secret and the Access application *(needs Michael's Cloudflare and Anthropic accounts; outward-facing, so Michael confirms first)*.

## Verification
- `npm test` (Vitest):
  - `cardGuard` (real test card numbers are caught; phone numbers and dates pass),
  - `prompt.ts` (each tool gets the right reference files; frontmatter is stripped; the system prefix is byte-stable for caching),
  - request validation (an unknown tool or an oversized field is rejected),
  - a mocked SDK stream: text is forwarded, and `pause_turn` is resumed.
- `npm run dev` with a real key in `.dev.vars`: run each tool once with a sample input (a sample Fillout submission, a Disney trip for a family of four, a Facebook promo post, a welcome email). Check the following:
  - the voice and footer are present;
  - no invented prices;
  - "verify" flags and sources appear on Adventure Planner;
  - copy and paste into Gmail keeps the formatting;
  - a pasted test card number is blocked before any request is sent (Network tab shows no `/api/draft` call).
- The UI is checked in the built-in browser at 1440×900 (a single Mac screen) and with reduced motion.
- `npm run build:plugin`, then install the zip in the Claude desktop app and run each skill once.
- After deploy: an email that isn't on the list is refused by Access, and `curl` to `/api/draft` without an Access JWT returns 401.

## Calls I made after the builder check (check these)
- **Welcome Center fit rules:** add `brains/reference/fit-rules.md` with Jillian's own thresholds (minimum budget per night or trip by destination, destinations she does or doesn't book, minimum lead time, planning fee per tier), marked TODO until she fills it in. The budget reality check is **for Jillian's eyes only and never states dollar amounts in the client reply**. There's no web search for this tool. Until the rules are filled in, the verdict says "not enough fit rules yet," not a guess.
- **Client contact details:** the browser automatically masks email addresses and phone numbers (`[email]`, `[phone]`) before sending, because no draft needs them. Names, ages, dates and budgets go through, since the drafts need them. Card numbers are blocked outright, as are US SSN and passport-number patterns. Jillian sees one line in the UI saying what was masked.
- **Plugin skills stand on their own:** each `SKILL.md` asks for missing details itself, refuses card numbers itself, and carries the "never invent prices, flag verify" rules in its own text. That way the plugin is safe for Jillian too, not just the maintainer. The website's Worker adds the same rules again.
- **Travefy output:** Adventure Planner returns plain-text day blocks with a **Copy day** button on each, plus a separate "For Jillian only" panel holding the verify flags, sources and booking-window reminders, so internal notes never get pasted into the client itinerary.

## Open items that need Jillian or the maintainer (none of these block the build)
- 2–3 real emails she's sent (for her voice), the MMV brand guide and EarMarked guidelines, her Blueprint-call booking link, and her payment-reminder schedule.
- Who owns the Anthropic API account and the Cloudflare account.
