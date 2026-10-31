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
| How the "Ask me anything" chat talks and what it won't do | `brains/chat.md` |
| What goes into proposals, itineraries and estimates | `brains/deliverables.md` |

Look for lines marked **TODO**. Those are the gaps Jillian still needs to fill in. Until she does, the assistant leaves placeholders and says "verify" instead of guessing. Most urgent:
1. `fit-rules.md`: a first draft from John's numbers (commission, the about-$5,000 rule of thumb, lead time). Jillian should confirm them and fill in the remaining TODOs; Welcome Center's "worth your time" estimate depends on them.
2. `compliance.md`: paste in the MMV brand guide and EarMarked rules.
3. `voice.md`: paste 2–3 real emails Jillian has sent (with client names removed).
4. `business.md`: add the Blueprint Call booking link and the payment-reminder schedule.
5. `compliance.md`: if client documents need a disclaimer (e.g. "prices subject to availability"), write its exact wording there.

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

The website is the main way to use it. Jillian can also have the same five tools inside the Claude desktop app on her Mac (without the saved trips and client documents, which only the website has). That needs a paid Claude plan (Pro or above).

**Easiest: upload once.** Someone with the code runs `npm run build:plugin`, which creates `dist-plugin/magical-vacations.zip`. In the Claude app, go to **Customize → Plugins → Add → Upload plugin** and choose that zip. To update, upload the new zip.

**Better: stay updated automatically.**
1. In the Claude app, go to **Customize → Plugins → Add → Add marketplace**, and paste this repository's GitHub address (`MADscientist314/MagicalMomentsVacation`).
2. Install **Magical Vacations by Jillian** from that marketplace.
3. Turn on **Sync automatically**.

Updates arrive on their own. Start a **new chat** to use the latest version.

In a chat, Jillian types `/` and picks a tool, or just asks: "Draft a welcome email for the Rivera family."

## Signing in to the website

The website asks for the **magic words**, a single shared password. Capitals and spaces don't matter. Once Jillian signs in, her browser remembers her for 30 days, and **Sign out** is at the bottom of the home screen.

The magic words are never written in this repository, which is public. Michael shares them privately. To change them, someone with the code runs `npx wrangler secret put APP_PASSWORD` and types the new words. Everyone is signed out, and the new words work straight away.

Don't post the magic words anywhere public: anyone who has them can use the assistant, and that spends API credit.

## Talking instead of typing

On the home screen ("Or just ask me anything") and on the chat page there's a **microphone** button. Tap it, talk, and tap again (or pause) to stop. Her words appear in the box so she can fix anything misheard before sending. The first time, the browser asks permission to use the microphone; she should choose **Allow**. It works in Safari and Chrome on a Mac. The speech-to-text is done by Apple (Safari) or Google (Chrome).

## Saved trips and chats

Trips (Adventure Planner) and chats ("Ask me anything") are saved on Cloudflare, behind the magic words, so Jillian can pick them up on any device. The quick tools (Magic Mail, Welcome Center, Inbox Helper, Spread the Magic) save nothing.

- **Nothing is deleted automatically.** To delete a trip, use the trash icon on the trips list and confirm; its conversation and documents go with it. Chats have a trash icon in **Your chats**.
- **Deleted by mistake?** Someone with the code can roll the whole database back to a moment before the delete (Cloudflare "D1 Time Travel", up to 30 days). It rolls back everything, so do it soon.
- Email addresses and phone numbers are hidden before a message is saved, just as before sending.

## Client documents

On a trip's page, the **Client deliverables** panel makes a proposal, an itinerary or an estimate from the conversation.

- **Prices only come from Jillian.** Any price she didn't type into the trip conversation herself shows as **Add price**. Prices Claude found online are only hints, so she should check them with the supplier.
- **Review & edit** lets her change any text or price and **Save as new version**; older versions are kept. **Client copy** is what the family sees: no internal notes.
- **PDF** opens the print dialog; choose **Save as PDF**. **HTML** saves a single web page she can attach or upload. If a price still says "Add price", both warn first.
- Her signature and the legal footer are added automatically from `voice.md` and `compliance.md`, so changing those files changes new documents too.

## What never to paste in

- **Card numbers, Social Security numbers or passport numbers.** The assistant blocks these and won't send them, but don't paste them anyway.
- Client email addresses and phone numbers are fine to leave in a pasted inquiry. They're hidden automatically before anything is sent, because no draft needs them.

## Costs and keys

- Claude usage is billed to the Anthropic account that owns the API key, at about a few cents per email and $0.20–0.50 per trip plan. A monthly spending limit is set in the Anthropic Console (in the workspace's limits settings).
- Cloudflare is $5/month (Workers Paid).
- If the API key ever needs replacing, someone with the code runs `npx wrangler secret put ANTHROPIC_API_KEY` and pastes the new key.
