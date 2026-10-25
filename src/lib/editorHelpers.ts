// Small helpers for the deliverable editor, which edits any deliverable's JSON generically.

const LABELS: Record<string, string> = {
  title: "Title",
  intro: "Opening note",
  options: "Options",
  highlights: "Highlights (one per line)",
  bestFor: "Best for",
  price: "Price",
  amount: "Price",
  note: "Note",
  recommendation: "My recommendation",
  nextSteps: "Next steps (one per line)",
  verifyNotes: "Notes for you (not shown to the client)",
  days: "Days",
  items: "Activities",
  time: "Time",
  text: "What happens",
  tips: "Good to know (one per line)",
  lineItems: "Line items",
  label: "Item",
  qty: "Qty",
  unitPrice: "Price each",
  notes: "Notes (one per line)",
  name: "Name",
  summary: "Summary",
};

export function humanize(key: string): string {
  if (LABELS[key]) return LABELS[key];
  const words = key.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const PRICE_KEYS = new Set(["amount", "unitPrice"]);

/** A blank row shaped like an existing one, for "Add another". */
export function emptyLike(value: unknown, key = ""): unknown {
  if (Array.isArray(value)) return [];
  if (value === null || PRICE_KEYS.has(key) || key === "time") return null;
  if (typeof value === "number") return key === "qty" ? 1 : 0;
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, emptyLike(v, k)]));
  }
  return "";
}

/** Reads a price as typed ("$2,140.50"); blank or unreadable means "still to add". */
export function toPrice(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
