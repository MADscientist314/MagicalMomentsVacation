import type { DeliverableData, DeliverableKind, Estimate, Proposal } from "../../shared/deliverables";

/** "Whitfield family" → "Whitfield-family", for downloaded file names. */
export const fileStem = (title: string, fallback: string) =>
  title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || fallback;

export function downloadName(title: string, kind: DeliverableKind, version: number): string {
  return `${fileStem(title, "trip")}-${kind}-v${version}.html`;
}

/** What still says "Add price", so Jillian is warned before sending it to a client. */
export function missingPrices(kind: DeliverableKind, data: DeliverableData): string[] {
  if (kind === "proposal") return (data as Proposal).options.filter((o) => o.price.amount === null).map((o) => o.name);
  if (kind === "estimate") return (data as Estimate).lineItems.filter((l) => l.unitPrice === null).map((l) => l.label);
  return [];
}
