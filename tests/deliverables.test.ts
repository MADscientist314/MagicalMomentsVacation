import { describe, expect, it } from "vitest";
import {
  applyPriceProvenance,
  estimateTotals,
  numbersIn,
  DELIVERABLE_SCHEMAS,
  documentPhotoIds,
  renderDeliverableHtml,
  validateDeliverable,
  type Estimate,
  type Itinerary,
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
    expect(validateDeliverable("estimate", { ...ESTIMATE, lineItems: [{ ...ESTIMATE.lineItems[0], unit: 4 }] }).ok).toBe(false);
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

  it("shows what an estimate line counts, e.g. 4 nights", () => {
    const est: Estimate = { ...ESTIMATE, lineItems: [{ label: "Hard Rock Hotel", qty: 4, unit: "nights", unitPrice: 400, note: "" }] };
    const html = renderDeliverableHtml("estimate", est, { ...BRAND, mode: "client" });
    expect(html).toContain(">4 nights<");
    expect(html).toContain("$1,600.00");
  });

  it("still renders older estimate lines that have no unit", () => {
    const html = renderDeliverableHtml("estimate", ESTIMATE, { ...BRAND, mode: "client" });
    expect(html).toContain(">4<");
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

describe("pictures in an itinerary", () => {
  const PHOTO = "0b8f6f2e-3c1d-4c7a-9a39-5d2f1e6a7b8c";
  const DAY_PHOTO = "1c9a7a3f-4d2e-4d8b-8b4a-6e3a2f7b8c9d";
  const TRIP: Itinerary = {
    title: "Your Disney week",
    intro: "Here's the plan.",
    coverPhoto: PHOTO,
    days: [
      { title: "Day 1 — Pool day", items: [{ time: null, text: "Swim" }], photo: DAY_PHOTO },
      { title: "Day 2 — Magic Kingdom", items: [{ time: "9 AM", text: "Rope drop" }] },
    ],
    tips: [],
    verifyNotes: [],
  };
  const brand = { footer: "Legal", signature: "Jillian", mode: "client" as const };

  it("accepts picture ids on the cover and days, and nothing else there", () => {
    expect(validateDeliverable("itinerary", TRIP).ok).toBe(true);
    expect(validateDeliverable("itinerary", { ...TRIP, coverPhoto: "javascript:alert(1)" }).ok).toBe(false);
    expect(validateDeliverable("itinerary", { ...TRIP, days: [{ ...TRIP.days[0], photo: "<img>" }] }).ok).toBe(false);
  });

  it("puts the pictures in the page when they've been loaded, and skips the rest", () => {
    const html = renderDeliverableHtml("itinerary", TRIP, { ...brand, photos: { [PHOTO]: "data:image/jpeg;base64,AAAA" } });
    expect(html).toContain('<figure class="cover"><img src="data:image/jpeg;base64,AAAA" alt=""></figure>');
    expect(html).not.toContain(DAY_PHOTO);
    expect(renderDeliverableHtml("itinerary", TRIP, brand)).not.toContain("<figure");
  });

  it("only takes data: images, so a document can't load anything from elsewhere", () => {
    const html = renderDeliverableHtml("itinerary", TRIP, {
      ...brand,
      photos: { [PHOTO]: "https://example.com/x.jpg", [DAY_PHOTO]: "data:image/png;base64,BBBB" },
    });
    expect(html).not.toContain("example.com");
    expect(html).toContain('<img class="day-photo" src="data:image/png;base64,BBBB" alt="">');
  });

  it("never asks Claude for picture ids", () => {
    expect(JSON.stringify(DELIVERABLE_SCHEMAS.itinerary)).not.toContain("photo");
  });
});

describe("pictures in a proposal", () => {
  const COVER = "2d0b8b4a-5e3f-4e9c-9c5b-7f4b3a8c9d0e";
  const OPTION = "3e1c9c5b-6f4a-4fad-8d6c-8a5c4b9d0e1f";
  const WITH_PICTURES: Proposal = {
    ...PROPOSAL,
    coverPhoto: COVER,
    options: [{ ...PROPOSAL.options[0], photo: OPTION }, PROPOSAL.options[1]],
  };
  const brand = { footer: "Legal", signature: "Jillian", mode: "client" as const };

  it("accepts picture ids on the cover and options only", () => {
    expect(validateDeliverable("proposal", WITH_PICTURES).ok).toBe(true);
    expect(validateDeliverable("proposal", { ...WITH_PICTURES, coverPhoto: "nope" }).ok).toBe(false);
    expect(documentPhotoIds("proposal", WITH_PICTURES)).toEqual([COVER, OPTION]);
    expect(documentPhotoIds("estimate", { title: "x", lineItems: [], notes: [], verifyNotes: [] })).toEqual([]);
  });

  it("shows the cover and each option's picture", () => {
    const html = renderDeliverableHtml("proposal", WITH_PICTURES, {
      ...brand,
      photos: { [COVER]: "data:image/jpeg;base64,CCCC", [OPTION]: "data:image/jpeg;base64,DDDD" },
    });
    expect(html).toContain('<figure class="cover"><img src="data:image/jpeg;base64,CCCC" alt=""></figure>');
    expect(html).toContain('<img class="option-photo" src="data:image/jpeg;base64,DDDD" alt="">');
  });

  it("never asks Claude for picture ids", () => {
    expect(JSON.stringify(DELIVERABLE_SCHEMAS.proposal)).not.toContain("photo");
  });
});
