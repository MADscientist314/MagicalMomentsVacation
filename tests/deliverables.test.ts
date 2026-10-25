import { describe, expect, it } from "vitest";
import {
  applyPriceProvenance,
  estimateTotals,
  numbersIn,
  renderDeliverableHtml,
  validateDeliverable,
  type Estimate,
  type Proposal,
} from "../shared/deliverables";

const PROPOSAL: Proposal = {
  title: "Your Walt Disney World options",
  intro: "Three great ways to do your first trip.",
  options: [
    { name: "Pop Century", summary: "Value", highlights: ["Skyliner"], bestFor: "Budget", price: { amount: 4200, note: "7 nights" } },
    { name: "Polynesian", summary: "Deluxe", highlights: ["Monorail"], bestFor: "Splurge", price: { amount: null, note: "" } },
  ],
  recommendation: "Pop Century",
  nextSteps: ["Pick one"],
  verifyNotes: ["Check Skyliner refurb dates"],
};

const ESTIMATE: Estimate = {
  title: "Rivera trip estimate",
  lineItems: [
    { label: "Resort, 7 nights", qty: 1, unitPrice: 2140.5, note: "" },
    { label: "Park tickets", qty: 4, unitPrice: 600, note: "" },
    { label: "Travel insurance", qty: 1, unitPrice: null, note: "" },
  ],
  notes: ["Deposit due at booking"],
  verifyNotes: [],
};

const BRAND = { footer: "As to Disney artwork… © Disney.", signature: "Jillian Jochum\nMagical Moments Vacations" };

describe("validateDeliverable", () => {
  it("accepts a well-formed proposal", () => {
    expect(validateDeliverable("proposal", PROPOSAL)).toEqual({ ok: true, data: PROPOSAL });
  });

  it("needs two to four proposal options", () => {
    expect(validateDeliverable("proposal", { ...PROPOSAL, options: [PROPOSAL.options[0]] }).ok).toBe(false);
  });

  it("rejects the wrong shape", () => {
    expect(validateDeliverable("estimate", { title: "x" }).ok).toBe(false);
    expect(validateDeliverable("estimate", { ...ESTIMATE, lineItems: [{ ...ESTIMATE.lineItems[0], qty: -1 }] }).ok).toBe(false);
    expect(validateDeliverable("itinerary", "nope").ok).toBe(false);
    // The renderer relies on every line having a note (even an empty one).
    const { note: _, ...noNote } = ESTIMATE.lineItems[0];
    expect(validateDeliverable("estimate", { ...ESTIMATE, lineItems: [noNote] }).ok).toBe(false);
  });
});

describe("estimateTotals", () => {
  it("adds up priced lines and lists the ones still missing a price", () => {
    expect(estimateTotals(ESTIMATE)).toEqual({ total: 4540.5, missing: ["Travel insurance"] });
  });
});

describe("price safety", () => {
  it("reads numbers the way people write prices", () => {
    expect(numbersIn("$2,140.50 for 3 nights, or 4200")).toEqual([2140.5, 3, 4200]);
  });

  it("keeps prices Jillian gave and blanks any she didn't", () => {
    const allowed = new Set(numbersIn("Pop is $4,200 for the week"));
    const checked = applyPriceProvenance("proposal", { ...PROPOSAL, options: [PROPOSAL.options[0], { ...PROPOSAL.options[1], price: { amount: 9999, note: "" } }] }, allowed) as Proposal;
    expect(checked.options.map((o) => o.price.amount)).toEqual([4200, null]);
  });

  it("does the same for estimate lines", () => {
    const checked = applyPriceProvenance("estimate", ESTIMATE, new Set([600])) as Estimate;
    expect(checked.lineItems.map((l) => l.unitPrice)).toEqual([null, 600, null]);
  });
});

describe("renderDeliverableHtml", () => {
  it("escapes anything that looks like code", () => {
    const html = renderDeliverableHtml("proposal", { ...PROPOSAL, intro: "<script>alert(1)</script>" }, { ...BRAND, mode: "client" });
    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes her signature and the legal footer", () => {
    const html = renderDeliverableHtml("proposal", PROPOSAL, { ...BRAND, mode: "client" });
    expect(html).toContain("Magical Moments Vacations");
    expect(html).toContain("© Disney.");
  });

  it("shows 'Add price' where a price is missing", () => {
    expect(renderDeliverableHtml("proposal", PROPOSAL, { ...BRAND, mode: "client" })).toContain("Add price");
  });

  it("keeps internal notes out of the client copy but shows them for review", () => {
    expect(renderDeliverableHtml("proposal", PROPOSAL, { ...BRAND, mode: "client" })).not.toContain("Check Skyliner");
    expect(renderDeliverableHtml("proposal", PROPOSAL, { ...BRAND, mode: "review" })).toContain("Check Skyliner");
  });

  it("shows the estimate total in dollars", () => {
    expect(renderDeliverableHtml("estimate", ESTIMATE, { ...BRAND, mode: "client" })).toContain("$4,540.50");
  });

  it("renders an itinerary day by day", () => {
    const html = renderDeliverableHtml(
      "itinerary",
      { title: "Rivera itinerary", intro: "", days: [{ title: "Day 1 — Arrival", items: [{ time: "3:00 PM", text: "Check in" }] }], tips: [], verifyNotes: [] },
      { ...BRAND, mode: "client" },
    );
    expect(html).toContain("Day 1 — Arrival");
    expect(html).toContain("3:00 PM");
  });
});
