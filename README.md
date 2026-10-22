# Magical Vacations assistant

A small, login-protected website where Jillian Jochum (Magical Moments Vacations) drafts client emails, reviews new inquiries, writes compliant marketing posts and sketches trip plans. Claude does the drafting; Jillian reviews and sends everything herself. The same "brains" also ship as a Claude app plugin.

- **Design:** [docs/superpowers/specs/2026-10-22-jillian-assistant-design.md](docs/superpowers/specs/2026-10-22-jillian-assistant-design.md)
- **For the person maintaining what it says:** [docs/MAINTAINING.md](docs/MAINTAINING.md)

## How it fits together

```
brains/            what the assistant knows and how each tool behaves (plain Markdown) ← edit these
src/               the website (React + Vite)
worker/            Cloudflare Worker: POST /api/draft → Claude (streaming), plus the login check
shared/            code used by both: tool definitions, card-number guard, stream format
scripts/           build-plugin.mjs: brains/ → plugin/magical-vacations/ + a zip
plugin/            GENERATED Claude app plugin (don't edit by hand)
```

The Worker builds Claude's instructions from `brains/` at deploy time, calls `claude-opus-5-5` with streaming, and re-streams the text to the browser. Card, SSN and passport numbers are blocked in the browser and again in the Worker. Email addresses and phone numbers are masked before anything is sent. Nothing is stored.

## Local development

Needs Node.js 22 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars   # then put a real Anthropic API key in .dev.vars
npm run dev
```

`.dev.vars` sets `ACCESS_MODE=off` so you can use the app locally without Cloudflare Access. Never set that in production.

| Script | What it does |
|---|---|
| `npm run dev` | Local site + Worker at http://localhost:5173 |
| `npm test` | Unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run build:plugin` | Rebuild `plugin/` and `dist-plugin/magical-vacations.zip` from `brains/` |
| `npm run cf-typegen` | Regenerate `worker-configuration.d.ts` after changing `wrangler.jsonc` |
| `npm run deploy` | Build and deploy to Cloudflare |

## Deploying (one time)

You need a Cloudflare account on **Workers Paid ($5/month)**, because the free plan's 10 ms CPU limit is too tight for streaming long replies, and an Anthropic API key.

1. `npx wrangler login`
2. `npx wrangler secret put ANTHROPIC_API_KEY`, then paste the key.
3. `npm run deploy`. The site is now at `https://magical-assistant.<your-subdomain>.workers.dev`, but the API refuses requests until step 4 is done.
4. **Turn on the login.** In the Cloudflare dashboard, go to **Workers & Pages → magical-assistant → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access**.
   - Under **Manage Cloudflare Access**, allow only Jillian's and the maintainer's email addresses.
   - In **Zero Trust → Integrations → Identity providers**, add **One-time PIN**, so they sign in with a code sent by email.
   - Copy the **team domain** (`https://<team>.cloudflareaccess.com`) and the **AUD tag** that Cloudflare shows into `vars.TEAM_DOMAIN` and `vars.POLICY_AUD` in `wrangler.jsonc`, then deploy again.
5. **Auto-deploy from GitHub:** **Settings → Builds → Connect** to this repository. Every push to `main` then redeploys. The Worker name must stay `magical-assistant` to match `wrangler.jsonc`.
6. **Cap the spend:** in the Anthropic Console, set a monthly limit for the workspace that owns the key (for example $25).

Rough cost: an everyday draft is a few cents; a trip plan with web searches is about $0.20–0.50.

## The Claude app plugin

`npm run build:plugin` writes `plugin/magical-vacations/` and `dist-plugin/magical-vacations.zip`. A GitHub Action (`.github/workflows/plugin.yml`) rebuilds and commits `plugin/` whenever `brains/` changes on `main`. `.claude-plugin/marketplace.json` lets the Claude app add this repository as a plugin marketplace. Install steps are in [docs/MAINTAINING.md](docs/MAINTAINING.md).
