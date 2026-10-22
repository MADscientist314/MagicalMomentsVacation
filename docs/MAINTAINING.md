# Looking after Jillian's assistant

This guide is for whoever keeps the assistant up to date: changing its voice, adding Jillian's rules, or updating booking windows. No coding is needed. Everything it knows lives in a handful of plain text files, and changing one is like editing a document.

## Which file controls what

All of them are in the `brains/` folder on GitHub.

| To change… | Edit this file |
|---|---|
| How Jillian sounds, her signature, sample emails | `brains/reference/voice.md` |
| Her services, planning tiers, Blueprint Call link, payment-reminder timing | `brains/reference/business.md` |
| The legal footer, name format, MMV and Disney EarMarked rules | `brains/reference/compliance.md` |
| When dining, Lightning Lane, Express Pass and cruise reservations open | `brains/reference/booking-windows.md` |
| Her rules for which inquiries are a good fit (budgets, lead time, destinations) | `brains/reference/fit-rules.md` |
| How a whole tool behaves | `brains/skills/<tool>/SKILL.md` |

Look for lines marked **TODO**. Those are the gaps Jillian still needs to fill in. Until she does, the assistant leaves placeholders and says "verify" instead of guessing. Most urgent:
1. `fit-rules.md`: until it's filled in, Welcome Center can't say whether an inquiry is a fit.
2. `compliance.md`: paste in the MMV brand guide and EarMarked rules.
3. `voice.md`: paste 2–3 real emails Jillian has sent (with client names removed).
4. `business.md`: add the Blueprint Call booking link and the payment-reminder schedule.

## How to edit a file

1. Open the repository on github.com and click into `brains/`, then the file.
2. Click the **pencil icon** (Edit this file).
3. Make your change. Keep the `#` headings as they are.
4. Click **Commit changes…**, write a short note like "Add Disney dining window," and confirm.

That's it. Within about two minutes:
- **the website** picks up the change on its own, and
- **the Claude app plugin** is rebuilt on its own.

To undo a change, open the file's **History** and copy the old text back.

**Don't** edit anything under `plugin/`. That folder is generated from `brains/` and gets overwritten.

## Installing the assistant in the Claude app (optional)

The website is the main way to use it. Jillian can also have the same four tools inside the Claude desktop app on her Mac. That needs a paid Claude plan (Pro or above).

**Easiest: upload once.** Someone with the code runs `npm run build:plugin`, which creates `dist-plugin/magical-vacations.zip`. In the Claude app, go to **Customize → Plugins → Add → Upload plugin** and choose that zip. To update, upload the new zip.

**Better: stay updated automatically.**
1. In the Claude app, go to **Customize → Plugins → Add → Add marketplace**, and paste this repository's GitHub address. For a private repo, Claude asks you to connect GitHub and give it access.
2. Install **Magical Vacations by Jillian** from that marketplace.
3. Turn on **Sync automatically**.

Updates arrive on their own. Start a **new chat** to use the latest version.

In a chat, Jillian types `/` and picks a tool, or just asks: "Draft a welcome email for the Rivera family."

## Who can sign in to the website

The site is protected by Cloudflare Access: only listed email addresses can open it, and each sign-in sends a one-time code by email. To add or remove someone, go to the Cloudflare dashboard → **Workers & Pages → magical-assistant → Settings → Domains & Routes → Manage Cloudflare Access** and edit the list of emails.

## What never to paste in

- **Card numbers, Social Security numbers or passport numbers.** The assistant blocks these and won't send them, but don't paste them anyway.
- Client email addresses and phone numbers are fine to leave in a pasted inquiry. They're hidden automatically before anything is sent, because no draft needs them.

## Costs and keys

- Claude usage is billed to the Anthropic account that owns the API key, at about a few cents per email and $0.20–0.50 per trip plan. A monthly spending limit is set in the Anthropic Console (in the workspace's limits settings).
- Cloudflare is $5/month (Workers Paid).
- If the API key ever needs replacing, someone with the code runs `npx wrangler secret put ANTHROPIC_API_KEY` and pastes the new key.
