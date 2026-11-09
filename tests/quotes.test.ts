// Quotes from supplier screenshots (John's Nov 9 feedback): price breakdowns that add themselves up,
// reading pictures, filling one option from a quote, and quotes sent with "Make the proposal".
import { beforeEach, describe, expect, it } from "vitest";
import {
  applyPriceProvenance,
  optionTotal,
  renderDeliverableHtml,
  settleTotals,
  tidyDeliverable,
  validateDeliverable,
  type OptionPrice,
  type Proposal,
} from "../shared/deliverables";
import { QUOTES_NOTE } from "../shared/conversations";
import { handleConversations, type ConversationDeps } from "../worker/conversations";
import { checkBreakdowns, handleDeliverable } from "../worker/deliverables";
import { handleQuoteLines, handleReadImage } from "../worker/quotes";
import { addDeliverable, appendMessages, createConversation, getDeliverable, getMessages } from "../worker/store";
import { EventParser, type ServerEvent } from "../shared/sse";
import { missingPrices } from "../src/lib/deliverableFiles";
import { toLinePrice } from "../src/lib/editorHelpers";
import { fitScale, sliceTops } from "../src/lib/imageText";
import { fakeD1 } from "./helpers/fakeD1";
import { fakeClaude, textEvents } from "./helpers/fakeClaude";

let env: Env;
let pending: Promise<unknown>[];
beforeEach(() => {
  env = { ANTHROPIC_API_KEY: "test", APP_PASSWORD: "test", DB: fakeD1() } as Env;
  pending = [];
});

const option = (name: string, price: OptionPrice) => ({ name, summary: "", highlights: [], bestFor: "", price });
const proposal = (...options: ReturnType<typeof option>[]): Proposal => ({
  title: "Your Universal trip",
  intro: "",
  options,
  recommendation: "",
  nextSteps: [],
  verifyNotes: [],
});
const PORTOFINO: OptionPrice = {
  amount: null,
  note: "3 nights, 2 adults + 5 kids",
  lines: [
    { label: "Portofino Bay, Garden View 2 Queens, 3 nights", qty: 1, unitPrice: 2140 },
    { label: "2-day park-to-park tickets", qty: 7, unitPrice: 129.99 },
    { label: "Florida resident discount", qty: 1, unitPrice: -250 },
  ],
};

describe("an option's price breakdown", () => {
  it("adds the lines up, discounts included, and says which still need a price", () => {
    expect(optionTotal(PORTOFINO)).toEqual({ total: 2799.93, missing: [], itemized: true });
    const gap = { ...PORTOFINO, lines: [...PORTOFINO.lines!, { label: "Travel insurance", qty: 1, unitPrice: null }] };
    expect(optionTotal(gap)).toEqual({ total: null, missing: ["Travel insurance"], itemized: true });
    // Proposals saved before breakdowns existed keep their one price.
    expect(optionTotal({ amount: 4200, note: "" })).toEqual({ total: 4200, missing: [], itemized: false });
    expect(optionTotal({ amount: 4200, note: "", lines: [] }).total).toBe(4200);
  });

  it("saves each itemized option's amount as its lines' total", () => {
    const settled = settleTotals("proposal", proposal(option("Portofino", { ...PORTOFINO, amount: 1 }), option("Pop", { amount: 4200, note: "" })));
    expect(settled.options.map((o) => o.price.amount)).toEqual([2799.93, 4200]);
  });

  it("checks the lines and drops empty ones", () => {
    const withBlank = proposal(option("Portofino", { ...PORTOFINO, lines: [...PORTOFINO.lines!, { label: " ", qty: 1, unitPrice: null }] }));
    const tidied = tidyDeliverable("proposal", withBlank) as Proposal;
    expect(tidied.options[0].price.lines).toHaveLength(3);
    expect(validateDeliverable("proposal", tidied).ok).toBe(true);
    const unnamed = proposal(option("Portofino", { ...PORTOFINO, lines: [{ label: "", qty: 1, unitPrice: 20 }] }));
    expect(validateDeliverable("proposal", tidyDeliverable("proposal", unnamed))).toEqual({
      ok: false,
      error: "Option 1, price line 1 needs a name (what it's for) — fill it in or remove the line.",
    });
    const zero = proposal(option("Portofino", { ...PORTOFINO, lines: [{ label: "Tickets", qty: 0, unitPrice: 20 }] }));
    expect(validateDeliverable("proposal", zero)).toMatchObject({ ok: false, error: expect.stringContaining("“how many”") });
  });

  it("only keeps line prices Jillian gave, matching a discount by its number", () => {
    const invented = { ...PORTOFINO, lines: [...PORTOFINO.lines!, { label: "Express Pass", qty: 7, unitPrice: 99 }] };
    const safe = applyPriceProvenance("proposal", proposal(option("Portofino", invented)), new Set([2140, 129.99, 250])) as Proposal;
    expect(safe.options[0].price.lines!.map((l) => l.unitPrice)).toEqual([2140, 129.99, -250, null]);
  });

  it("shows the family the breakdown and its total", () => {
    const html = renderDeliverableHtml("proposal", proposal(option("Portofino", PORTOFINO)), { footer: "", signature: "", mode: "client" });
    expect(html).toContain('<table class="breakdown">');
    expect(html).toContain("7 × $129.99");
    expect(html).toContain("$909.93");
    expect(html).toContain("-$250.00");
    expect(html).toContain('<span class="total-label">Total</span> $2,799.93');
    const gap = { ...PORTOFINO, lines: [{ label: "Hotel", qty: 1, unitPrice: null }] };
    expect(renderDeliverableHtml("proposal", proposal(option("P", gap)), { footer: "", signature: "", mode: "client" })).toContain("Add price");
  });

  it("warns before sending an option whose lines still need a price", () => {
    const gap = { ...PORTOFINO, lines: [{ label: "Hotel", qty: 1, unitPrice: null }] };
    expect(missingPrices("proposal", proposal(option("Portofino", PORTOFINO), option("Hard Rock", gap)))).toEqual(["Hard Rock"]);
  });

  it("notes when the quote's own total doesn't match the lines", () => {
    const checked = checkBreakdowns(proposal(option("Portofino", { ...PORTOFINO, amount: 3049.93 })));
    expect(checked.verifyNotes).toEqual([
      "Portofino: the lines add up to $2,799.93, but the quote's total says $3,049.93. Check for a missing fee, tax or discount before sending.",
    ]);
    expect(checked.options[0].price.amount).toBe(2799.93);
    expect(checkBreakdowns(proposal(option("Portofino", { ...PORTOFINO, amount: 2799.93 }))).verifyNotes).toEqual([]);
  });

  it("reads a typed discount", () => {
    expect(toLinePrice("-$150")).toBe(-150);
    expect(toLinePrice("($1,250.50)")).toBe(-1250.5);
    expect(toLinePrice("$99")).toBe(99);
    expect(toLinePrice("")).toBeNull();
  });
});

describe("slicing a tall screenshot", () => {
  it("cuts overlapping slices that cover the whole picture", () => {
    expect(sliceTops(1000)).toEqual([0]);
    const tops = sliceTops(4000);
    expect(tops[0]).toBe(0);
    expect(tops.at(-1)).toBe(4000 - 1568);
    for (let i = 1; i < tops.length; i++) expect(tops[i] - tops[i - 1]).toBeLessThanOrEqual(1568 - 120);
  });

  it("shrinks a very tall page so it needs at most 10 slices", () => {
    expect(fitScale(1200, 800)).toBe(1);
    expect(fitScale(2880, 1800)).toBeCloseTo(1568 / 2880);
    const scale = fitScale(1400, 40_000);
    expect(sliceTops(Math.round(40_000 * scale)).length).toBeLessThanOrEqual(10);
  });
});

const PNG = btoa(String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52));
const JPEG = btoa(String.fromCharCode(0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1));
const post = (path: string, body: unknown) =>
  new Request(`https://app.test/api/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const reply = (text: string, stop_reason = "end_turn") => ({ final: { content: [{ type: "text", text, citations: null }], stop_reason } }) as never;

describe("/api/read-image", () => {
  it("sends the slices to Claude and returns the text, with card numbers and contacts taken out", async () => {
    const fake = fakeClaude(reply("Portofino Bay, 3 nights   $2,140.00\nCard 4111 1111 1111 1111\nQuestions? res@example.com"));
    const res = await handleReadImage(post("read-image", { images: [{ type: "image/jpeg", data: JPEG }, { type: "image/png", data: PNG }] }), env, { makeClient: fake.make });
    expect(res.status).toBe(200);
    const { text } = (await res.json()) as { text: string };
    expect(text).toContain("$2,140.00");
    expect(text).not.toContain("4111");
    expect(text).not.toContain("res@example.com");
    const params = fake.calls[0];
    const content = params.messages[0].content as { type: string }[];
    expect(content.map((b) => b.type)).toEqual(["image", "image", "text"]);
    expect(params.tools).toBeUndefined();
  });

  it("turns away what isn't a picture, too many pictures, and a renamed file", async () => {
    const fake = fakeClaude(reply("x"));
    const deps = { makeClient: fake.make };
    expect((await handleReadImage(post("read-image", { images: [] }), env, deps)).status).toBe(400);
    expect((await handleReadImage(post("read-image", { images: [{ type: "image/gif", data: PNG }] }), env, deps)).status).toBe(400);
    expect((await handleReadImage(post("read-image", { images: [{ type: "image/jpeg", data: PNG }] }), env, deps)).status).toBe(400);
    const many = Array.from({ length: 11 }, () => ({ type: "image/png", data: PNG }));
    expect((await handleReadImage(post("read-image", { images: many }), env, deps)).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("says so when there's no text in the picture", async () => {
    const res = await handleReadImage(post("read-image", { images: [{ type: "image/png", data: PNG }] }), env, { makeClient: fakeClaude(reply("NO_TEXT")).make });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toMatch(/couldn't find any text/);
  });
});

describe("/api/quote-lines", () => {
  const QUOTE = "Portofino Bay Hotel — Garden View, 2 Queens\n3 nights   $2,140.00\nPark tickets 7 x $129.99\nResident discount -$250.00\nTotal $3,049.93";

  it("itemizes one option from a quote, keeps only its numbers, adds it up and flags a mismatch", async () => {
    const fake = fakeClaude(
      reply(
        JSON.stringify({
          lines: [
            { label: "Portofino Bay, Garden View 2 Queens, 3 nights", qty: 1, unitPrice: 2140 },
            { label: "Park tickets", qty: 7, unitPrice: 129.99 },
            { label: "Resident discount", qty: 1, unitPrice: -250 },
            { label: "Express Pass", qty: 1, unitPrice: 899 },
          ],
          amount: 3049.93,
          note: "3 nights",
        }),
      ),
    );
    const res = await handleQuoteLines(post("quote-lines", { text: QUOTE, option: "Portofino Bay" }), env, { makeClient: fake.make });
    expect(res.status).toBe(200);
    const { price, warning } = (await res.json()) as { price: OptionPrice; warning: string | null };
    expect(price.lines!.map((l) => l.unitPrice)).toEqual([2140, 129.99, -250, null]);
    expect(price.amount).toBeNull();
    expect(warning).toBe("Portofino Bay: the quote's total is $3,049.93, but one line still needs a price.");
    expect(JSON.stringify(fake.calls[0].messages)).toContain("Portofino Bay");
    expect(fake.calls[0].output_config).toMatchObject({ format: { type: "json_schema" } });
  });

  it("refuses a card number and an empty quote", async () => {
    const fake = fakeClaude(reply("{}"));
    expect((await handleQuoteLines(post("quote-lines", { text: "Card 4111 1111 1111 1111", option: "" }), env, { makeClient: fake.make })).status).toBe(400);
    expect((await handleQuoteLines(post("quote-lines", { text: " ", option: "" }), env, { makeClient: fake.make })).status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("says so when the quote has no prices", async () => {
    const fake = fakeClaude(reply(JSON.stringify({ lines: [], amount: null, note: "" })));
    const res = await handleQuoteLines(post("quote-lines", { text: "Thanks for your interest!", option: "" }), env, { makeClient: fake.make });
    expect(res.status).toBe(422);
  });
});

describe("quotes sent with Make the proposal", () => {
  async function plannedTrip() {
    const c = await createConversation(env.DB, { kind: "trip", title: "Rivera family", details: { lastName: "Rivera" } }, 1);
    await appendMessages(env.DB, c.id, [{ role: "user", content: "**Client:** Rivera family" }, { role: "assistant", content: "### Day 1\nRest" }], 2);
    return c;
  }
  async function generate(id: string, body: Record<string, unknown>, d: ConversationDeps) {
    const res = await handleConversations(post(`conversations/${id}/deliverables`, body), env, [id, "deliverables"], d);
    if (!res.headers.get("content-type")?.includes("event-stream")) return { res, events: [] as ServerEvent[] };
    const events = new EventParser().push(await res.text());
    await Promise.all(pending);
    return { res, events };
  }
  const json = (data: unknown) => textEvents(JSON.stringify(data));
  const deps = (data: unknown) => {
    const fake = fakeClaude({ events: json(data) });
    return { fake, d: { makeClient: fake.make, now: () => 5_000, keepaliveMs: 15_000, waitUntil: (p: Promise<unknown>) => void pending.push(p) } };
  };
  const QUOTES = "[Attached: Screenshot 1.png (screenshot, read by the assistant)]\nPortofino Bay 3 nights $2,140.00\nTickets 7 x $129.99\nResident discount -$250.00\n[End of Screenshot 1.png]";

  it("uses the quotes' prices, adds up each option, and keeps the quotes in the trip's conversation", async () => {
    const c = await plannedTrip();
    const { fake, d } = deps(proposal(option("Portofino Bay", { ...PORTOFINO, amount: null })));
    const { events } = await generate(c.id, { kind: "proposal", options: "one", quotes: QUOTES }, d);
    expect(events.map((e) => e.event)).toEqual(["deliverable", "done"]);
    expect(JSON.stringify(fake.calls[0].messages)).toContain("Resident discount");
    const saved = (await getDeliverable(env.DB, (events[0].data as { id: string }).id))?.data as Proposal;
    expect(saved.options[0].price.lines!.map((l) => l.unitPrice)).toEqual([2140, 129.99, -250]);
    expect(saved.options[0].price.amount).toBe(2799.93);
    const messages = await getMessages(env.DB, c.id);
    expect(messages.at(-2)?.content).toBe(`${QUOTES_NOTE}\n${QUOTES}`);
    expect(messages.at(-1)?.content).toContain("proposal v1");
  });

  it("turns away quotes with a card number, and quotes for anything but a proposal", async () => {
    const c = await plannedTrip();
    const { fake, d } = deps(proposal(option("Portofino Bay", PORTOFINO)));
    expect((await generate(c.id, { kind: "proposal", quotes: "Card 4111 1111 1111 1111" }, d)).res.status).toBe(400);
    expect((await generate(c.id, { kind: "itinerary", quotes: QUOTES }, d)).res.status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("editing a breakdown", () => {
  it("saves the edited lines with the amount set to their total", async () => {
    const c = await createConversation(env.DB, { kind: "trip", title: "Rivera family", details: { lastName: "Rivera" } }, 1);
    const first = await addDeliverable(env.DB, c.id, "proposal", proposal(option("Portofino", { amount: 4000, note: "" })), 2);
    const edited = proposal(option("Portofino", { ...PORTOFINO, amount: 4000 }));
    const res = await handleDeliverable(post(`deliverables/${first.id}/edit`, { data: edited }), env, [first.id, "edit"], () => 3);
    expect(res.status).toBe(200);
    const { id } = (await res.json()) as { id: string };
    expect(((await getDeliverable(env.DB, id))?.data as Proposal).options[0].price.amount).toBe(2799.93);
  });
});
