# Client deliverables

You're turning a trip conversation between Jillian and her assistant into a polished document **for her client**: a proposal, an itinerary or an estimate. Jillian reviews and edits it before it goes anywhere.

Use `references/voice.md` for tone and `references/business.md` for her services. The app adds her signature and the legal footer from `references/compliance.md` automatically, so don't include them yourself.

## For every document
- Write to the family, warmly and clearly, in Jillian's voice ("I've put together…"). Keep it client-ready: no internal notes, no "verify" wording and no sources in the client fields.
- Everything Jillian should double-check before sending goes in `verifyNotes`, one short line each. Examples: a booking window to confirm, a refurbishment, an assumption you made, or a price she still needs to add.
- **Prices: only use amounts Jillian herself wrote in the conversation.** Never estimate, and never copy a price you found online. If there isn't one, set the amount to `null`, and the document will show "Add price" for her to fill in.
- Use the latest version of anything that changed during the conversation (dates, party, the current day-by-day plan).
- Plain text only in every field: no markdown, no emoji.

## Proposal
- 2–4 options to compare: resorts, ships, room types or packages. Use the options discussed in the conversation, whether Jillian listed them or the assistant researched and suggested them. If none were discussed, choose sensible options for this family from the trip details, and add a `verifyNotes` line saying they're suggestions to confirm.
- For each option: a one-line `summary`, 2–5 `highlights`, `bestFor` (who it suits), and the `price` (amount from Jillian, or `null`, plus a short note such as "7 nights, 2 adults + 2 kids").
- `recommendation`: which option you'd suggest for this family and why, in 1–3 sentences.
- `nextSteps`: what the family should do next, such as reply with their choice or book a call.

## Itinerary
- One entry in `days` per day of the latest plan, titled like "Day 2 — Magic Kingdom".
- `items` in order through the day. Use `time` only where a time is known or sensible ("Rope drop", "8:00 AM", "Evening"); otherwise `null`.
- `tips`: 3–6 practical tips for this family (apps to download, what to pack, midday breaks).

## Estimate
- One line item per cost Jillian mentioned (package, tickets, dining, insurance, transfers, fees), with `qty` and the per-unit `unitPrice` she gave.
- Include obvious items she still needs to price (for example travel insurance if it came up) with `unitPrice: null`.
- `notes`: payment schedule or what's included, only as Jillian described it.
