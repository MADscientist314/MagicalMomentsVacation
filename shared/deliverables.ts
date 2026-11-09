// Client deliverables (proposal, itinerary, estimate, extras): types, JSON schemas for
// Claude's structured output, validation, totals, price safety and the branded page.

export type DeliverableKind = "proposal" | "itinerary" | "estimate" | "extras";
export const DELIVERABLE_KINDS: DeliverableKind[] = ["proposal", "itinerary", "estimate", "extras"];
export const DELIVERABLE_LABELS: Record<DeliverableKind, string> = {
  proposal: "Proposal",
  itinerary: "Itinerary",
  estimate: "Estimate",
  extras: "Extras",
};

/** What an Extras document can cover; she picks any of these and can ask for more in her own words. */
export const EXTRAS_TOPICS = {
  packing: "Packing list",
  apps: "Apps to download",
  before: "Before you go",
  tips: "Good to know",
} as const;
export type ExtrasTopic = keyof typeof EXTRAS_TOPICS;
export const isExtrasTopic = (x: unknown): x is ExtrasTopic => typeof x === "string" && Object.hasOwn(EXTRAS_TOPICS, x);

/**
 * One cost in an option's price breakdown ("Portofino Bay, 3 nights", "2-day park-to-park tickets").
 * A discount is a line with a negative price. The app adds the lines up; Claude never does the math.
 */
export interface PriceLine {
  label: string;
  qty: number;
  unitPrice: number | null;
}

/** An option's price: one amount, or (since Nov 9) a breakdown whose lines the app adds into `amount`. */
export interface OptionPrice {
  amount: number | null;
  note: string;
  /** Proposals saved before Nov 9 have none; an empty list means a single price. */
  lines?: PriceLine[];
}

export interface Proposal {
  title: string;
  intro: string;
  /** Image id of the cover picture; Jillian adds pictures herself, Claude never writes these. */
  coverPhoto?: string;
  options: {
    name: string;
    summary: string;
    highlights: string[];
    bestFor: string;
    price: OptionPrice;
    photo?: string;
  }[];
  recommendation: string;
  nextSteps: string[];
  verifyNotes: string[];
}

export interface Itinerary {
  title: string;
  intro: string;
  /** Image id of the cover picture; Jillian adds pictures herself, Claude never writes these. */
  coverPhoto?: string;
  days: { title: string; items: { time: string | null; text: string }[]; photo?: string }[];
  tips: string[];
  verifyNotes: string[];
}

/**
 * Everything that isn't a day of the trip: a packing list, apps to download, a before-you-go checklist.
 * Its own document, so none of it gets crammed into a day of the itinerary (Nov 7 review).
 */
export interface Extras {
  title: string;
  intro: string;
  sections: { heading: string; checklist: string[] }[];
  verifyNotes: string[];
}

/** Every picture a document uses: the cover, then each day's (itinerary) or option's (proposal). */
export function documentPhotoIds(kind: DeliverableKind, data: DeliverableData): string[] {
  const ids =
    kind === "itinerary"
      ? [(data as Itinerary).coverPhoto, ...(data as Itinerary).days.map((d) => d.photo)]
      : kind === "proposal"
        ? [(data as Proposal).coverPhoto, ...(data as Proposal).options.map((o) => o.photo)]
        : [];
  return ids.filter((id): id is string => typeof id === "string");
}

/** Proposals and itineraries can carry pictures; estimates and extras can't. */
export const HAS_PICTURES = (kind: DeliverableKind) => kind === "proposal" || kind === "itinerary";

export interface Estimate {
  title: string;
  /** `unit` says what `qty` counts ("nights", "tickets"); estimates saved before it existed have none. */
  lineItems: { label: string; qty: number; unit?: string; unitPrice: number | null; note: string }[];
  notes: string[];
  verifyNotes: string[];
}

export type DeliverableData = Proposal | Itinerary | Estimate | Extras;

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
        price: object({
          lines: { type: "array", items: object({ label: str, qty: { type: "number" }, unitPrice: nullableNumber }) },
          amount: nullableNumber,
          note: str,
        }),
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
    lineItems: { type: "array", items: object({ label: str, qty: { type: "number" }, unit: str, unitPrice: nullableNumber, note: str }) },
    notes: strList,
    verifyNotes: strList,
  }),
  extras: object({
    title: str,
    intro: str,
    sections: { type: "array", items: object({ heading: str, checklist: strList }) },
    verifyNotes: strList,
  }),
};

// ---------- validation ----------

type Result = { ok: true; data: DeliverableData } | { ok: false; error: string };
const MAX_TEXT = 5_000;
const MAX_LIST = 50;

/** Fewest and most rows each list can have; the editor hides Remove and "Add another" at these. */
export const LIST_LIMITS: Record<string, { min: number; max: number }> = {
  options: { min: 1, max: 4 },
  days: { min: 1, max: 60 },
  lineItems: { min: 1, max: 100 },
  items: { min: 0, max: 100 },
  sections: { min: 1, max: 12 },
  lines: { min: 0, max: 30 },
};

const isPrice = (x: unknown): x is number | null => x === null || (typeof x === "number" && Number.isFinite(x) && x >= 0);
/** A breakdown line may be a discount, so below zero is fine. */
const isLinePrice = (x: unknown): x is number | null => x === null || (typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 10_000_000);
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const isPhotoId = (x: unknown) => x === undefined || (typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
const TOO_LONG = `keep it under ${MAX_TEXT.toLocaleString("en-US")} characters`;

/** A problem with one piece of text, said the way Jillian would fix it, or null. */
function text(x: unknown, what: string, ifBlank?: string): string | null {
  if (typeof x !== "string") return `${what} is missing.`;
  if (x.length > MAX_TEXT) return `${what} is too long — ${TOO_LONG}.`;
  if (ifBlank && !x.trim()) return ifBlank;
  return null;
}

function lines(x: unknown, what: string): string | null {
  if (!Array.isArray(x) || !x.every((s) => typeof s === "string")) return `${what} is missing.`;
  if (x.length > MAX_LIST) return `${what} can have up to ${MAX_LIST} lines.`;
  const long = x.findIndex((s: string) => s.length > MAX_TEXT);
  return long < 0 ? null : `${what}, line ${long + 1} is too long — ${TOO_LONG}.`;
}

function rows(x: unknown, key: string, none: string, many: string): string | null {
  const { min, max } = LIST_LIMITS[key];
  if (!Array.isArray(x) || x.length < min) return none;
  return x.length > max ? many : null;
}

const first = (...problems: (string | null)[]) => problems.find((p) => p !== null) ?? null;
const BAD_PICTURE = "One of the pictures isn't right — remove it and add it again.";

function checkProposal(d: Record<string, unknown>): string | null {
  const top = first(
    text(d.title, "The title", "Give the proposal a title."),
    text(d.intro, "The opening note"),
    text(d.recommendation, "The recommendation"),
    lines(d.nextSteps, "Next steps"),
    lines(d.verifyNotes, "Your notes"),
    isPhotoId(d.coverPhoto) ? null : BAD_PICTURE,
    rows(d.options, "options", "A proposal needs at least one option.", `A proposal can have up to ${LIST_LIMITS.options.max} options.`),
  );
  if (top) return top;
  for (const [i, o] of (d.options as unknown[]).entries()) {
    const n = `Option ${i + 1}`;
    if (!isObject(o)) return `${n} is missing.`;
    const problem = first(
      text(o.name, `${n}'s name`, `${n} needs a name — fill it in or remove the option.`),
      text(o.summary, `${n}'s summary`),
      lines(o.highlights, `${n}'s highlights`),
      text(o.bestFor, `${n}'s “best for”`),
      isObject(o.price) && isPrice(o.price.amount) ? text(o.price.note, `${n}'s price note`) : `${n}'s price should be a number of dollars.`,
      isPhotoId(o.photo) ? null : BAD_PICTURE,
    );
    if (problem) return problem;
    const priceLines = (o.price as Record<string, unknown>).lines;
    if (priceLines === undefined) continue;
    const many = rows(priceLines, "lines", `${n}'s price breakdown is missing.`, `${n}'s price breakdown can have up to ${LIST_LIMITS.lines.max} lines.`);
    if (many) return many;
    for (const [j, l] of (priceLines as unknown[]).entries()) {
      const c = `${n}, price line ${j + 1}`;
      if (!isObject(l)) return `${c} is missing.`;
      const lineProblem = first(
        text(l.label, c, `${c} needs a name (what it's for) — fill it in or remove the line.`),
        isLinePrice(l.unitPrice) ? null : `${c}'s price should be a number of dollars.`,
        typeof l.qty === "number" && Number.isFinite(l.qty) && l.qty > 0 ? null : `${c}'s “how many” should be more than 0.`,
      );
      if (lineProblem) return lineProblem;
    }
  }
  return null;
}

function checkItinerary(d: Record<string, unknown>): string | null {
  const top = first(
    text(d.title, "The title", "Give the itinerary a title."),
    text(d.intro, "The opening note"),
    lines(d.tips, "Good to know"),
    lines(d.verifyNotes, "Your notes"),
    isPhotoId(d.coverPhoto) ? null : BAD_PICTURE,
    rows(d.days, "days", "An itinerary needs at least one day.", `An itinerary can have up to ${LIST_LIMITS.days.max} days.`),
  );
  if (top) return top;
  for (const [i, day] of (d.days as unknown[]).entries()) {
    const n = `Day ${i + 1}`;
    if (!isObject(day)) return `${n} is missing.`;
    const problem = first(
      text(day.title, `${n}'s title`, `${n} needs a title.`),
      isPhotoId(day.photo) ? null : BAD_PICTURE,
      rows(day.items, "items", `${n}'s activities are missing.`, `${n} can have up to ${LIST_LIMITS.items.max} activities.`),
    );
    if (problem) return problem;
    for (const [j, item] of (day.items as unknown[]).entries()) {
      const a = `${n}, activity ${j + 1}`;
      if (!isObject(item)) return `${a} is missing.`;
      const itemProblem = first(
        text(item.text, a, `${a} needs a description — fill it in or remove it.`),
        item.time === null || item.time === undefined ? null : text(item.time, `${a}'s time`),
      );
      if (itemProblem) return itemProblem;
    }
  }
  return null;
}

function checkEstimate(d: Record<string, unknown>): string | null {
  const top = first(
    text(d.title, "The title", "Give the estimate a title."),
    lines(d.notes, "Notes"),
    lines(d.verifyNotes, "Your notes"),
    rows(d.lineItems, "lineItems", "An estimate needs at least one line.", `An estimate can have up to ${LIST_LIMITS.lineItems.max} lines.`),
  );
  if (top) return top;
  for (const [i, l] of (d.lineItems as unknown[]).entries()) {
    const n = `Line ${i + 1}`;
    if (!isObject(l)) return `${n} is missing.`;
    const problem = first(
      text(l.label, `${n}'s item`, `${n} needs an item name — fill it in or remove the line.`),
      isPrice(l.unitPrice) ? null : `${n}'s price should be a number of dollars.`,
      text(l.note, `${n}'s note`),
      l.unit === undefined ? null : text(l.unit, `${n}'s “of what”`),
      typeof l.qty === "number" && Number.isFinite(l.qty) && l.qty > 0 ? null : `${n}'s “how many” should be more than 0.`,
    );
    if (problem) return problem;
  }
  return null;
}

function checkExtras(d: Record<string, unknown>): string | null {
  const top = first(
    text(d.title, "The title", "Give the extras a title."),
    text(d.intro, "The opening note"),
    lines(d.verifyNotes, "Your notes"),
    rows(d.sections, "sections", "Extras need at least one section.", `Extras can have up to ${LIST_LIMITS.sections.max} sections.`),
  );
  if (top) return top;
  for (const [i, section] of (d.sections as unknown[]).entries()) {
    const n = `Section ${i + 1}`;
    if (!isObject(section)) return `${n} is missing.`;
    const problem = first(
      text(section.heading, `${n}'s heading`, `${n} needs a heading — fill it in or remove the section.`),
      lines(section.checklist, `${n}'s list`),
    );
    if (problem) return problem;
  }
  return null;
}

const CHECKS: Record<DeliverableKind, (d: Record<string, unknown>) => string | null> = {
  proposal: checkProposal,
  itinerary: checkItinerary,
  estimate: checkEstimate,
  extras: checkExtras,
};

/** Checks a deliverable's shape; a failure says what to fix ("Option 2 needs a name…"). */
export function validateDeliverable(kind: DeliverableKind, data: unknown): Result {
  if (!isObject(data)) return { ok: false, error: "That document is empty." };
  const problem = CHECKS[kind](data);
  return problem ? { ok: false, error: problem } : { ok: true, data: data as unknown as DeliverableData };
}

const blank = (x: unknown) => typeof x !== "string" || !x.trim();
const dropBlankLines = (x: unknown) => (Array.isArray(x) ? x.filter((s) => !blank(s)) : x);

/**
 * Clears out what an edit leaves empty before it's checked and saved: blank lines in lists,
 * activities and estimate lines with nothing in them, and options or days that are wholly empty.
 * Anything half filled in is kept, so the check can say what's missing.
 */
export function tidyDeliverable(kind: DeliverableKind, data: unknown): unknown {
  if (!isObject(data)) return data;
  const d: Record<string, unknown> = { ...data };
  for (const key of ["nextSteps", "verifyNotes", "tips", "notes"]) if (key in d) d[key] = dropBlankLines(d[key]);
  if (kind === "proposal" && Array.isArray(d.options)) {
    d.options = d.options
      .map((o) => {
        if (!isObject(o)) return o;
        const tidied: Record<string, unknown> = { ...o, highlights: dropBlankLines(o.highlights) };
        if (isObject(o.price) && Array.isArray(o.price.lines)) {
          const lines = o.price.lines.filter((l) => !(isObject(l) && blank(l.label) && (l.unitPrice ?? null) === null));
          tidied.price = { ...o.price, lines };
        }
        return tidied;
      })
      .filter((o) => {
        if (!isObject(o)) return true;
        const price: Record<string, unknown> = isObject(o.price) ? o.price : {};
        const empty = blank(o.name) && blank(o.summary) && blank(o.bestFor) && Array.isArray(o.highlights) && !o.highlights.length;
        const noLines = !Array.isArray(price.lines) || !price.lines.length;
        return !(empty && noLines && (price.amount ?? null) === null && blank(price.note) && o.photo === undefined);
      });
  }
  if (kind === "itinerary" && Array.isArray(d.days)) {
    d.days = d.days
      .map((day) => {
        if (!isObject(day) || !Array.isArray(day.items)) return day;
        return { ...day, items: day.items.filter((it) => !(isObject(it) && blank(it.text) && blank(it.time))) };
      })
      .filter((day) => !(isObject(day) && blank(day.title) && Array.isArray(day.items) && !day.items.length && day.photo === undefined));
  }
  if (kind === "estimate" && Array.isArray(d.lineItems)) {
    d.lineItems = d.lineItems.filter((l) => !(isObject(l) && blank(l.label) && (l.unitPrice ?? null) === null && blank(l.note)));
  }
  if (kind === "extras" && Array.isArray(d.sections)) {
    d.sections = d.sections
      .map((section) => (isObject(section) ? { ...section, checklist: dropBlankLines(section.checklist) } : section))
      .filter((section) => !(isObject(section) && blank(section.heading) && Array.isArray(section.checklist) && !section.checklist.length));
  }
  return d;
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

const cents = (n: number) => Math.round(n * 100) / 100;

/** What an option costs: its lines added up (null while any line still needs a price), or its one amount. */
export function optionTotal(price: OptionPrice): { total: number | null; missing: string[]; itemized: boolean } {
  const lines = price.lines ?? [];
  if (!lines.length) return { total: price.amount, missing: [], itemized: false };
  const missing = lines.filter((l) => l.unitPrice === null).map((l) => l.label);
  const total = cents(lines.reduce((sum, l) => sum + l.qty * (l.unitPrice ?? 0), 0));
  return { total: missing.length ? null : total, missing, itemized: true };
}

/** Sets each itemized option's amount to its lines' total, so the saved document always adds up. */
export function settleTotals<T extends DeliverableData>(kind: DeliverableKind, data: T): T {
  if (kind !== "proposal") return data;
  const copy = structuredClone(data) as Proposal;
  for (const o of copy.options) {
    const { total, itemized } = optionTotal(o.price);
    if (itemized) o.price.amount = total;
  }
  return copy as unknown as T;
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
    for (const o of (copy as Proposal).options) {
      if (!known(o.price.amount)) o.price.amount = null;
      // Discounts are written "-$150" or "($150)": the number itself is what has to match.
      for (const l of o.price.lines ?? []) if (l.unitPrice !== null && !known(Math.abs(l.unitPrice))) l.unitPrice = null;
    }
  } else if (kind === "estimate") {
    for (const l of (copy as Estimate).lineItems) if (!known(l.unitPrice)) l.unitPrice = null;
  }
  return copy;
}

// ---------- the branded page ----------

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const money = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
const priceOrGap = (n: number | null) => (n === null ? `<span class="missing">Add price</span>` : esc(money(n)));
const list = (items: string[]) => {
  const filled = items.filter((i) => i.trim());
  return filled.length ? `<ul>${filled.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : "";
};
const para = (text: string) => (text.trim() ? `<p>${esc(text)}</p>` : "");

/**
 * Picture id → where the page gets it: a data: URL (the browser loads them, so the file works offline and
 * in a PDF), or on a share link the link's own picture address.
 */
type Photos = Record<string, string>;

/** Only an inline JPEG, PNG or WebP, or a share link's picture: a document never loads anything from elsewhere. */
function photoSrc(photos: Photos | undefined, id: string | undefined): string | null {
  const src = id ? photos?.[id] : undefined;
  if (!src) return null;
  return /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(src) || /^\/p\/[A-Za-z0-9_-]{32}\/[0-9a-f-]{36}$/i.test(src) ? src : null;
}

const lineMoney = (l: PriceLine) => (l.unitPrice === null ? null : l.qty * l.unitPrice);

/** An option's price: the breakdown table with its total, or the one price. */
function priceBlock(price: OptionPrice): string {
  const note = price.note.trim() ? ` <span class="note">${esc(price.note)}</span>` : "";
  const { total, itemized } = optionTotal(price);
  if (!itemized) return `<p class="price">${priceOrGap(price.amount)}${note}</p>`;
  const rows = (price.lines ?? [])
    .map((l) => {
      const each = l.qty !== 1 && l.unitPrice !== null ? `<div class="note">${l.qty} × ${esc(money(l.unitPrice))}</div>` : "";
      const amount = lineMoney(l);
      return `<tr><td>${esc(l.label)}${each}</td><td class="num">${amount === null ? priceOrGap(null) : esc(money(amount))}</td></tr>`;
    })
    .join("");
  return `<table class="breakdown"><tbody>${rows}</tbody></table>
  <p class="price"><span class="total-label">Total</span> ${priceOrGap(total)}${note}</p>`;
}

function proposalBody(p: Proposal, photos?: Photos): string {
  const single = p.options.length === 1;
  const cards = p.options
    .map((o) => {
      const src = photoSrc(photos, o.photo);
      return `<article class="option">
  ${src ? `<img class="option-photo" src="${src}" alt="">` : ""}<h2>${esc(o.name)}</h2>
  ${para(o.summary)}
  ${list(o.highlights)}
  ${o.bestFor.trim() ? `<p class="best"><strong>Best for:</strong> ${esc(o.bestFor)}</p>` : ""}
  ${priceBlock(o.price)}
</article>`;
    })
    .join("\n");
  return `<section class="options${single ? " single" : ""}">${cards}</section>
${p.recommendation.trim() ? `<section><h2>${single ? "Why it's a great fit" : "My recommendation"}</h2>${para(p.recommendation)}</section>` : ""}
${p.nextSteps.length ? `<section><h2>Next steps</h2>${list(p.nextSteps)}</section>` : ""}`;
}

function itineraryBody(i: Itinerary, photos?: Photos): string {
  const days = i.days
    .map((d) => {
      const src = photoSrc(photos, d.photo);
      return `<section class="day"><h2>${esc(d.title)}</h2>${src ? `<img class="day-photo" src="${src}" alt="">` : ""}<ul class="items">${d.items
        .map((it) => `<li>${it.time ? `<span class="time">${esc(it.time)}</span>` : ""}${esc(it.text)}</li>`)
        .join("")}</ul></section>`;
    })
    .join("\n");
  return `${days}${i.tips.length ? `<section><h2>Good to know</h2>${list(i.tips)}</section>` : ""}`;
}

function estimateBody(e: Estimate): string {
  const { total, missing } = estimateTotals(e);
  const rows = e.lineItems
    .map(
      (l) => `<tr><td>${esc(l.label)}${l.note.trim() ? `<div class="note">${esc(l.note)}</div>` : ""}</td><td class="num">${l.qty}${l.unit?.trim() ? ` ${esc(l.unit.trim())}` : ""}</td><td class="num">${priceOrGap(l.unitPrice)}</td><td class="num">${l.unitPrice === null ? "—" : esc(money(l.qty * l.unitPrice))}</td></tr>`,
    )
    .join("");
  return `<table class="estimate"><thead><tr><th>Item</th><th class="num">How many</th><th class="num">Price each</th><th class="num">Subtotal</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3">${missing.length ? "Total so far (some prices still to add)" : "Estimated total"}</td><td class="num">${esc(money(total))}</td></tr></tfoot></table>
${e.notes.length ? `<section><h2>Notes</h2>${list(e.notes)}</section>` : ""}`;
}

function extrasBody(x: Extras): string {
  return x.sections
    .map((section) => {
      const items = section.checklist.filter((i) => i.trim());
      return `<section class="extras-section"><h2>${esc(section.heading)}</h2>${
        items.length ? `<ul class="checklist">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""
      }</section>`;
    })
    .join("\n");
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
.option h2{margin-top:0}.option-photo{display:block;width:100%;height:150px;object-fit:cover;border-radius:8px;margin-bottom:12px}.single .option-photo{height:260px}.price{font-weight:600;font-size:18px;color:var(--purple)}.note{font-weight:400;font-size:13px;color:#6b6f6f}
.breakdown{width:100%;border-collapse:collapse;margin:10px 0 4px;font-size:14px}.breakdown td{border-bottom:1px solid var(--line);padding:5px 0;vertical-align:top}.breakdown .num{text-align:right;white-space:nowrap;padding-left:10px}.total-label{font-family:"Wix Madefor Text",system-ui,sans-serif;font-size:14px;font-weight:600;color:var(--ink);margin-right:4px}
.missing{background:#fff1c9;color:#7a5a00;border-radius:6px;padding:1px 8px;font-size:14px;font-weight:600}
.day{break-inside:avoid}.items{padding-left:18px}
.cover{margin:18px 0 6px}.cover img,.day-photo{display:block;width:100%;object-fit:cover;border-radius:12px}
.cover img{max-height:380px}.day-photo{max-height:260px;margin:4px 0 10px}.time{display:inline-block;min-width:84px;font-weight:600;color:var(--purple)}
table.estimate{width:100%;border-collapse:collapse;margin-top:18px;background:#fff}
.estimate th,.estimate td{border-bottom:1px solid var(--line);padding:9px 10px;text-align:left;vertical-align:top}
.estimate .num{text-align:right;white-space:nowrap}.estimate tfoot td{font-weight:700;border-bottom:none}
.extras-section{break-inside:avoid}.checklist{list-style:none;padding-left:0}.checklist li{position:relative;padding-left:30px;margin:6px 0}
.checklist li::before{content:"";position:absolute;left:2px;top:.3em;width:15px;height:15px;border:1.5px solid var(--purple);border-radius:4px;background:#fff}
.review{background:var(--lavender);border:1px dashed var(--purple);border-radius:12px;padding:12px 18px;margin-top:24px}
.review h2{margin-top:4px;font-size:17px}
footer{margin-top:32px;border-top:2px solid var(--line);padding-top:14px}
.share-bar{display:flex;justify-content:flex-end;margin-bottom:8px}.print-btn{font:600 14px "Wix Madefor Text",system-ui,sans-serif;color:var(--purple);background:#fff;border:1.5px solid var(--purple);border-radius:999px;padding:8px 18px;cursor:pointer}
@media print{.share-bar{display:none}}
.sig{white-space:pre-line;font-weight:600}.legal{font-size:11px;color:#6b6f6f;margin-top:10px}
@page{margin:16mm}@media print{body{background:#fff}.doc{padding:0}}
`;

export function renderDeliverableHtml(
  kind: DeliverableKind,
  data: DeliverableData,
  brand: {
    footer: string;
    signature: string;
    mode: "client" | "review";
    photos?: Photos;
    /** A share link's page: kept out of search engines, with a Print button (its one script carries this nonce). */
    share?: { nonce: string };
  },
): string {
  const body =
    kind === "proposal"
      ? proposalBody(data as Proposal, brand.photos)
      : kind === "itinerary"
        ? itineraryBody(data as Itinerary, brand.photos)
        : kind === "extras"
          ? extrasBody(data as Extras)
          : estimateBody(data as Estimate);
  const coverSrc = HAS_PICTURES(kind) ? photoSrc(brand.photos, (data as Itinerary | Proposal).coverPhoto) : null;
  const cover = coverSrc ? `<figure class="cover"><img src="${coverSrc}" alt=""></figure>` : "";
  const intro = "intro" in data ? para(data.intro) : "";
  const notes =
    brand.mode === "review" && data.verifyNotes.length
      ? `<aside class="review"><h2>For Jillian only — check before sending</h2>${list(data.verifyNotes)}</aside>`
      : "";
  const share = brand.share;
  const nonce = share ? esc(share.nonce) : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${share ? `<meta name="robots" content="noindex, nofollow">\n` : ""}<title>${esc(data.title)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@1,500&family=Wix+Madefor+Text:wght@400;600&display=swap">
<style>${STYLE}</style></head>
<body><main class="doc">
${share ? `<div class="share-bar"><button type="button" class="print-btn">Print or save as PDF</button></div>\n` : ""}<header><div class="brand">Magical Vacations by Jillian</div><h1>${esc(data.title)}</h1>${intro}</header>
${cover}${body}
${notes}
<footer><div class="sig">${esc(brand.signature)}</div><p class="legal">${esc(brand.footer)}</p></footer>
</main>${share ? `<script nonce="${nonce}">document.querySelector(".print-btn").addEventListener("click", () => print());</script>` : ""}</body></html>`;
}
