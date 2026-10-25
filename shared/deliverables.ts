// Client deliverables (proposal, itinerary, estimate): types, JSON schemas for
// Claude's structured output, validation, totals, price safety and the branded page.

export type DeliverableKind = "proposal" | "itinerary" | "estimate";
export const DELIVERABLE_KINDS: DeliverableKind[] = ["proposal", "itinerary", "estimate"];
export const DELIVERABLE_LABELS: Record<DeliverableKind, string> = {
  proposal: "Proposal",
  itinerary: "Itinerary",
  estimate: "Estimate",
};

export interface Proposal {
  title: string;
  intro: string;
  options: {
    name: string;
    summary: string;
    highlights: string[];
    bestFor: string;
    price: { amount: number | null; note: string };
  }[];
  recommendation: string;
  nextSteps: string[];
  verifyNotes: string[];
}

export interface Itinerary {
  title: string;
  intro: string;
  days: { title: string; items: { time: string | null; text: string }[] }[];
  tips: string[];
  verifyNotes: string[];
}

export interface Estimate {
  title: string;
  lineItems: { label: string; qty: number; unitPrice: number | null; note: string }[];
  notes: string[];
  verifyNotes: string[];
}

export type DeliverableData = Proposal | Itinerary | Estimate;

// ---------- JSON schemas (no minItems/maxItems: counts are checked in validateDeliverable) ----------

const str = { type: "string" } as const;
const strList = { type: "array", items: str } as const;
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] } as const;
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const DELIVERABLE_SCHEMAS: Record<DeliverableKind, Record<string, unknown>> = {
  proposal: object({
    title: str,
    intro: str,
    options: {
      type: "array",
      items: object({
        name: str,
        summary: str,
        highlights: strList,
        bestFor: str,
        price: object({ amount: nullableNumber, note: str }),
      }),
    },
    recommendation: str,
    nextSteps: strList,
    verifyNotes: strList,
  }),
  itinerary: object({
    title: str,
    intro: str,
    days: {
      type: "array",
      items: object({
        title: str,
        items: { type: "array", items: object({ time: { anyOf: [str, { type: "null" }] }, text: str }) },
      }),
    },
    tips: strList,
    verifyNotes: strList,
  }),
  estimate: object({
    title: str,
    lineItems: { type: "array", items: object({ label: str, qty: { type: "number" }, unitPrice: nullableNumber, note: str }) },
    notes: strList,
    verifyNotes: strList,
  }),
};

// ---------- validation ----------

type Result = { ok: true; data: DeliverableData } | { ok: false; error: string };
const MAX_TEXT = 5_000;

const isText = (x: unknown, required = false): x is string =>
  typeof x === "string" && x.length <= MAX_TEXT && (!required || x.trim().length > 0);
const isTextList = (x: unknown): x is string[] => Array.isArray(x) && x.length <= 50 && x.every((s) => isText(s));
const isPrice = (x: unknown): x is number | null => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

function checkProposal(d: Record<string, unknown>): string | null {
  if (!isText(d.title, true) || !isText(d.intro) || !isText(d.recommendation)) return "missing text";
  if (!isTextList(d.nextSteps) || !isTextList(d.verifyNotes)) return "bad lists";
  if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 4) return "needs 2–4 options";
  for (const o of d.options) {
    if (!isObject(o) || !isText(o.name, true) || !isText(o.summary) || !isText(o.bestFor) || !isTextList(o.highlights)) {
      return "bad option";
    }
    if (!isObject(o.price) || !isPrice(o.price.amount) || !isText(o.price.note)) return "bad price";
  }
  return null;
}

function checkItinerary(d: Record<string, unknown>): string | null {
  if (!isText(d.title, true) || !isText(d.intro)) return "missing text";
  if (!isTextList(d.tips) || !isTextList(d.verifyNotes)) return "bad lists";
  if (!Array.isArray(d.days) || d.days.length < 1 || d.days.length > 60) return "needs days";
  for (const day of d.days) {
    if (!isObject(day) || !isText(day.title, true) || !Array.isArray(day.items)) return "bad day";
    for (const item of day.items) {
      if (!isObject(item) || !isText(item.text, true) || !(item.time === null || item.time === undefined || isText(item.time))) {
        return "bad item";
      }
    }
  }
  return null;
}

function checkEstimate(d: Record<string, unknown>): string | null {
  if (!isText(d.title, true) || !isTextList(d.notes) || !isTextList(d.verifyNotes)) return "missing text";
  if (!Array.isArray(d.lineItems) || d.lineItems.length < 1 || d.lineItems.length > 100) return "needs line items";
  for (const l of d.lineItems) {
    if (!isObject(l) || !isText(l.label, true) || !isPrice(l.unitPrice) || !isText(l.note ?? "")) return "bad line";
    if (typeof l.qty !== "number" || !Number.isFinite(l.qty) || l.qty <= 0) return "bad quantity";
  }
  return null;
}

export function validateDeliverable(kind: DeliverableKind, data: unknown): Result {
  if (!isObject(data)) return { ok: false, error: "not an object" };
  const problem = kind === "proposal" ? checkProposal(data) : kind === "itinerary" ? checkItinerary(data) : checkEstimate(data);
  return problem ? { ok: false, error: problem } : { ok: true, data: data as unknown as DeliverableData };
}

// ---------- totals and price safety ----------

export function estimateTotals(e: Estimate): { total: number; missing: string[] } {
  let total = 0;
  const missing: string[] = [];
  for (const l of e.lineItems) {
    if (l.unitPrice === null) missing.push(l.label);
    else total += l.qty * l.unitPrice;
  }
  return { total: Math.round(total * 100) / 100, missing };
}

/** Every number in a piece of text, written the way people write prices ("$2,140.50"). */
export function numbersIn(text: string): number[] {
  return [...text.matchAll(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "")));
}

/** Blanks any price that Jillian didn't write herself, so it shows "Add price" instead. */
export function applyPriceProvenance(kind: DeliverableKind, data: DeliverableData, allowed: Set<number>): DeliverableData {
  const known = (n: number | null) => n !== null && [...allowed].some((a) => Math.abs(a - n) < 0.005);
  const copy = structuredClone(data);
  if (kind === "proposal") {
    for (const o of (copy as Proposal).options) if (!known(o.price.amount)) o.price.amount = null;
  } else if (kind === "estimate") {
    for (const l of (copy as Estimate).lineItems) if (!known(l.unitPrice)) l.unitPrice = null;
  }
  return copy;
}

// ---------- the branded page ----------

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const priceOrGap = (n: number | null) => (n === null ? `<span class="missing">Add price</span>` : esc(money(n)));
const list = (items: string[]) => {
  const filled = items.filter((i) => i.trim());
  return filled.length ? `<ul>${filled.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
};
const para = (text: string) => (text.trim() ? `<p>${esc(text)}</p>` : "");

function proposalBody(p: Proposal): string {
  const cards = p.options
    .map(
      (o) => `<article class="option">
  <h2>${esc(o.name)}</h2>
  ${para(o.summary)}
  ${list(o.highlights)}
  ${o.bestFor.trim() ? `<p class="best"><strong>Best for:</strong> ${esc(o.bestFor)}</p>` : ""}
  <p class="price">${priceOrGap(o.price.amount)}${o.price.note.trim() ? ` <span class="note">${esc(o.price.note)}</span>` : ""}</p>
</article>`,
    )
    .join("\n");
  return `<section class="options">${cards}</section>
${p.recommendation.trim() ? `<section><h2>My recommendation</h2>${para(p.recommendation)}</section>` : ""}
${p.nextSteps.length ? `<section><h2>Next steps</h2>${list(p.nextSteps)}</section>` : ""}`;
}

function itineraryBody(i: Itinerary): string {
  const days = i.days
    .map(
      (d) => `<section class="day"><h2>${esc(d.title)}</h2><ul class="items">${d.items
        .map((it) => `<li>${it.time ? `<span class="time">${esc(it.time)}</span>` : ""}${esc(it.text)}</li>`)
        .join("")}</ul></section>`,
    )
    .join("\n");
  return `${days}${i.tips.length ? `<section><h2>Good to know</h2>${list(i.tips)}</section>` : ""}`;
}

function estimateBody(e: Estimate): string {
  const { total, missing } = estimateTotals(e);
  const rows = e.lineItems
    .map(
      (l) => `<tr><td>${esc(l.label)}${l.note.trim() ? `<div class="note">${esc(l.note)}</div>` : ""}</td><td class="num">${l.qty}</td><td class="num">${priceOrGap(l.unitPrice)}</td><td class="num">${l.unitPrice === null ? "—" : esc(money(l.qty * l.unitPrice))}</td></tr>`,
    )
    .join("");
  return `<table class="estimate"><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Subtotal</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">${missing.length ? "Total so far (some prices still to add)" : "Estimated total"}</td><td class="num">${esc(money(total))}</td></tr></tfoot></table>
${e.notes.length ? `<section><h2>Notes</h2>${list(e.notes)}</section>` : ""}`;
}

const STYLE = `
:root{--purple:#7b3f99;--lavender:#f2dffc;--line:#d9bdeb;--cream:#fffbf5;--ink:#2c3333}
*{box-sizing:border-box}body{margin:0;background:var(--cream);color:var(--ink);font:16px/1.55 "Wix Madefor Text",system-ui,sans-serif}
.doc{max-width:820px;margin:0 auto;padding:40px 32px}
.brand{font:italic 500 15px "Fraunces",Georgia,serif;color:var(--purple);letter-spacing:.02em}
h1,h2{font-family:"Fraunces",Georgia,serif;font-style:italic;font-weight:500;color:var(--purple)}
h1{font-size:32px;margin:6px 0 10px}h2{font-size:21px;margin:22px 0 8px}
header{border-bottom:2px solid var(--line);padding-bottom:16px;margin-bottom:8px}
.options{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-top:18px}
.option{background:#fff;border:1px solid var(--line);border-radius:12px;padding:16px 18px;break-inside:avoid}
.option h2{margin-top:0}.price{font-weight:600;font-size:18px;color:var(--purple)}.note{font-weight:400;font-size:13px;color:#6b6f6f}
.missing{background:#fff1c9;color:#7a5a00;border-radius:6px;padding:1px 8px;font-size:14px;font-weight:600}
.day{break-inside:avoid}.items{padding-left:18px}.time{display:inline-block;min-width:84px;font-weight:600;color:var(--purple)}
table.estimate{width:100%;border-collapse:collapse;margin-top:18px;background:#fff}
.estimate th,.estimate td{border-bottom:1px solid var(--line);padding:9px 10px;text-align:left;vertical-align:top}
.estimate .num{text-align:right;white-space:nowrap}.estimate tfoot td{font-weight:700;border-bottom:none}
.review{background:var(--lavender);border:1px dashed var(--purple);border-radius:12px;padding:12px 18px;margin-top:24px}
.review h2{margin-top:4px;font-size:17px}
footer{margin-top:32px;border-top:2px solid var(--line);padding-top:14px}
.sig{white-space:pre-line;font-weight:600}.legal{font-size:11px;color:#6b6f6f;margin-top:10px}
@page{margin:16mm}@media print{body{background:#fff}.doc{padding:0}}
`;

export function renderDeliverableHtml(
  kind: DeliverableKind,
  data: DeliverableData,
  brand: { footer: string; signature: string; mode: "client" | "review" },
): string {
  const body =
    kind === "proposal"
      ? proposalBody(data as Proposal)
      : kind === "itinerary"
        ? itineraryBody(data as Itinerary)
        : estimateBody(data as Estimate);
  const intro = "intro" in data ? para(data.intro) : "";
  const notes =
    brand.mode === "review" && data.verifyNotes.length
      ? `<aside class="review"><h2>For Jillian only — check before sending</h2>${list(data.verifyNotes)}</aside>`
      : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,500&family=Wix+Madefor+Text:wght@400;600&display=swap">
<style>${STYLE}</style></head>
<body><main class="doc">
<header><div class="brand">Magical Vacations by Jillian</div><h1>${esc(data.title)}</h1>${intro}</header>
${body}
${notes}
<footer><div class="sig">${esc(brand.signature)}</div><p class="legal">${esc(brand.footer)}</p></footer>
</main></body></html>`;
}
