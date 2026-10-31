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
| Rules for every image (branding, words on images, her photos, brand colors) | `brains/images.md` |

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

Trips (Adventure Planner), chats ("Ask me anything"), every finished draft from Welcome Center, Inbox Helper and Spread the Magic, and their images are saved on Cloudflare, behind the magic words, so Jillian can pick them up on any device. Each tool page lists its saved drafts by name under the form; Inbox Helper's list works as a to-do list with a **Handled** checkbox.

Magic Mail's tile is gone from the home screen: its emails (welcome, payment reminder, pre-trip, welcome home and more) are now the quick-start buttons in Inbox Helper. Its old address still works.

- **Nothing is deleted automatically.** To delete a trip, use the trash icon on the trips list and confirm; its conversation and documents go with it. Chats have a trash icon in **Your chats**.
- **Deleted by mistake?** Someone with the code can roll the whole database back to a moment before the delete (Cloudflare "D1 Time Travel", up to 30 days). It rolls back everything, so do it soon.
- Email addresses and phone numbers are hidden before a message is saved, just as before sending.

## Images and cards

Images are made by Google's **Nano Banana**, about 3¢ each.

- **Any image:** the **Picture Perfect** tile on the home screen makes an image on its own: a social graphic, a flyer, a promo, a holiday greeting. She describes it (and can add photos); everything she makes there stays in that page's gallery.
- **For a post:** in Spread the Magic, once a post is finished, **Images for this post** appears under it (the **Make an image** button at the top of the post jumps there). Pick a shape (Portrait suits Facebook and Instagram, Wide suits newsletters and the website), optionally add photos, say what it should show ("our family by the pool at sunset, with the words 'Book by Dec 1'"), and click **Make an image**.
- **In an itinerary or proposal:** open it, and the **Review & edit** tab starts with **Pictures**. **Make all pictures** adds a cover and a picture for each day (itinerary) or each option (proposal), made from the plan (a stock-style family that matches who's going). Add the family's own photos and tap them first to put the real family in the pictures, or use **Use my photo** to place a photo as it is. **Remake** and **Remove** work per picture. The pictures go into the client copy, the HTML file and the PDF once she saves (PDF and HTML save for her).
- **For a family:** each trip page has **Pictures for this trip**: a **Trip picture** of the family living a moment from their plan (for a proposal, an email or a message), or a countdown, birthday, welcome-home or bon voyage card. It reads the trip's plan (the itinerary if there is one), so the pictures show what this family will actually do. With their photos added, it's them; otherwise a family like theirs.
- **Her photos:** **Add photos** takes up to 3 at a time into an image (tap a photo to use it or not). They're shrunk before uploading and kept with that post or trip. Don't upload photos of passports, IDs or cards.
- **Not quite right?** **Change this one** and say what to change. Every version is kept until she deletes it.
- **Saving:** **Download** saves the image to post or use anywhere.
- **The rules:** `brains/images.md` only blocks branding problems (copied logos, an "official" look, a character used as her logo, anything suggesting she works for Disney or Universal) and prices or dates she didn't give. Parks, castles and characters are otherwise allowed; Google may still refuse some requests ("Google wouldn't make that one"). Add her brand colors there once the brand guide arrives.
- **Limits:** 100 new images a day across the site, so a leaked password can't run up a big bill.

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

- Claude usage is billed to the Anthropic account that owns the API key, at a few cents per email, inquiry review or post, and about $0.25–0.50 per trip plan. A monthly spending limit is set in the Anthropic Console (in the workspace's limits settings).
- Images are billed by Google to the account that owns the Gemini key, about 3¢ each. A monthly spend cap is set on AI Studio's **Spend** page. Image files are stored in Cloudflare R2, free at her volume.
- Cloudflare is $5/month (Workers Paid).
- If the API key ever needs replacing, someone with the code runs `npx wrangler secret put ANTHROPIC_API_KEY` and pastes the new key (`GEMINI_API_KEY` for the Google image key).
