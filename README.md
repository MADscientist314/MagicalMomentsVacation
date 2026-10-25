# Magical Vacations assistant

A small, password-protected website where Jillian Jochum (Magical Moments Vacations) drafts client emails, reviews new inquiries, sorts and answers her inbox, writes compliant marketing posts, plans trips with clients' families and turns them into proposals, itineraries and estimates, or just chats with the assistant, by typing or by talking into the microphone. Claude does the drafting; Jillian reviews and sends everything herself. The same "brains" also ship as a Claude app plugin.

- **Design:** [docs/superpowers/specs/2026-10-22-jillian-assistant-design.md](docs/superpowers/specs/2026-10-22-jillian-assistant-design.md)
- **For the person maintaining what it says:** [docs/MAINTAINING.md](docs/MAINTAINING.md)

## How it fits together

```
brains/            what the assistant knows, how each tool behaves, and how the chat talks (plain Markdown) ← edit these
src/               the website (React + Vite)
worker/            Cloudflare Worker: /api/draft (one-off tools), /api/conversations (trips and chats), /api/deliverables, plus the password sign-in
shared/            code used by both: tool definitions, card-number guard, stream format, deliverable schemas and renderer
migrations/        D1 database tables (applied with wrangler, see below)
scripts/           build-plugin.mjs: brains/ → plugin/magical-vacations/ + a zip
plugin/            GENERATED Claude app plugin (don't edit by hand)
```

The Worker builds Claude's instructions from `brains/` at deploy time, calls `claude-opus-5-5` with streaming, and re-streams the text to the browser. Card, SSN and passport numbers are blocked in the browser and again in the Worker. Email addresses and phone numbers are masked before anything is sent or saved.

## What's stored

Magic Mail, Welcome Center, Inbox Helper and Spread the Magic store nothing: each draft lives only in the open tab.

Trips and chats are saved in a Cloudflare **D1** database (`magical-assistant`, binding `DB`) so Jillian can come back to them:
- `conversations`: one row per trip (titled "<last name> family") or chat, with the trip details and a pin flag.
- `messages`: the conversation, saved as masked text. Jillian's message and Claude's reply are saved together only once the reply finishes, so a reload mid-reply leaves nothing half-saved.
- `deliverables`: every version of each proposal, itinerary and estimate, as JSON.
- `login_failures`: failed sign-ins by IP, for the rate limit.

Nothing expires on its own. Deleting a trip or chat deletes its messages and documents. D1 Time Travel can restore the whole database to any minute in the last 30 days (7 on the free plan): `npx wrangler d1 time-travel restore magical-assistant --timestamp=<when>`. That rolls back every trip, not just one, so export first if other work has happened since.

## Trips and client documents

**Adventure Planner** (`#/trips`) is a list of trips, pinned first, then most recent. Each trip is an ongoing conversation: **Plan it** asks for the first day-by-day plan, and then she chats to change it. The Welcome Center's **Start a trip** button carries the inquiry's details into a new trip; nothing is saved until she clicks **Plan it**. A per-trip lock stops two replies running at once (the second request gets 409).

The side panel makes three client documents from the conversation: a **proposal** (2–4 options, which Claude can research on the web with **Suggest options for me**, or she can list her own), an **itinerary** and an **estimate**. Claude returns JSON in a fixed schema (`shared/deliverables.ts`); code renders it into one branded HTML page, adds her signature and footer from `brains/`, and adds up estimate totals. Any price that doesn't appear in Jillian's own messages is blanked to **Add price**. She fixes text and prices in the preview (**Save as new version**, no AI call) and downloads the client copy as HTML or prints it to PDF.

## Chat and the microphone

Besides the tools, there's a free-form chat (`#/chat`, also reachable from the "Or just ask me anything" bar on the home screen). It uses the same reference pack plus `brains/chat.md` and can search the web. Chats are saved under **Your chats**, where she can pin or delete them.

The microphone button uses the browser's built-in speech recognition (Safari and Chrome on a Mac). What she says is typed into the box for her to check and send; it isn't sent automatically. Where the browser can't listen (e.g. Firefox), the button doesn't appear. Note that Safari and Chrome do the speech-to-text on Apple's or Google's servers.

## Local development

Needs Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars   # then add a real Anthropic API key and pick the magic words
npm run db:migrate:local         # creates the local D1 tables under .wrangler/
npm run dev
```

## Signing in

The site asks for one shared password, called "the magic words". It comes from the `APP_PASSWORD` secret and is never in this repository. Capitals, spaces and punctuation don't matter, so "Magic Words!" and "magicwords" are the same password. A successful sign-in sets a signed, HttpOnly cookie that lasts 30 days. Changing `APP_PASSWORD` signs everyone out. After 10 wrong tries from one IP address in 15 minutes, sign-in answers "Too many tries" until the window passes.

Because anyone who knows the magic words can spend API credit, keep them out of anything public and keep the Anthropic spend limit in place. For a stronger lock, you can also turn on Cloudflare Access for the Worker; it works alongside the password with no code changes.

| Script | What it does |
|---|---|
| `npm run dev` | Local site + Worker at http://localhost:5173 |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run build:plugin` | Rebuild `plugin/` and `dist-plugin/magical-vacations.zip` from `brains/` |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |
| `npm run db:migrate:local` | Apply new files in `migrations/` to the local D1 database |
| `npm run db:migrate` | Apply new files in `migrations/` to the live D1 database |
| `npm run deploy` | Build and deploy to Cloudflare |

## Deploying (one time)

You need a Cloudflare account on **Workers Paid ($5/month)**, because the free plan's 10 ms CPU limit is too tight for streaming long replies, and an Anthropic API key.

1. `npx wrangler login`
2. `npx wrangler secret put ANTHROPIC_API_KEY`, then paste the key.
3. `npx wrangler secret put APP_PASSWORD`, then type the magic words Jillian will use.
4. `npx wrangler d1 create magical-assistant`, then copy the `database_id` it prints into `wrangler.jsonc`, and run `npm run db:migrate` to create the tables.
5. `npm run deploy`. The site is now at `https://magical-assistant.<your-subdomain>.workers.dev`.
6. **Auto-deploy from GitHub:** **Settings → Builds → Connect** to this repository, and set:
   - **Build command:** `npm run build`. The Vite build writes the deploy config and bundles `brains/` into the Worker, so `wrangler deploy` on its own won't work.
   - **Deploy command:** `npx wrangler deploy`

   Every push to `main` then redeploys. The Worker name must stay `magical-assistant` to match `wrangler.jsonc`. Auto-deploy doesn't touch the database: when a change adds a file to `migrations/`, run `npm run db:migrate` before (or right as) it deploys.
7. **Cap the spend:** in the Anthropic Console, set a monthly limit for the workspace that owns the key (for example $25).

Rough cost: an everyday draft is a few cents; a trip plan with web searches is about $0.20–0.50; each follow-up message in a trip or chat re-reads the saved conversation (mostly from the prompt cache, so cheaply); a client document is a few cents to about $0.20.

## The Claude app plugin

`npm run build:plugin` writes `plugin/magical-vacations/` and `dist-plugin/magical-vacations.zip`. A GitHub Action (`.github/workflows/plugin.yml`) rebuilds and commits `plugin/` whenever `brains/` changes on `main`. `.claude-plugin/marketplace.json` lets the Claude app add this repository as a plugin marketplace. Install steps are in [docs/MAINTAINING.md](docs/MAINTAINING.md).
