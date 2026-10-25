import type { DeliverableData, DeliverableKind, Estimate, Proposal } from "../../shared/deliverables";

export function downloadName(title: string, kind: DeliverableKind, version: number): string {
  const base = title.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || "trip";
  return `${base}-${kind}-v${version}.html`;
}

/** What still says "Add price", so Jillian is warned before sending it to a client. */
export function missingPrices(kind: DeliverableKind, data: DeliverableData): string[] {
  if (kind === "proposal") return (data as Proposal).options.filter((o) => o.price.amount === null).map((o) => o.name);
  if (kind === "estimate") return (data as Estimate).lineItems.filter((l) => l.unitPrice === null).map((l) => l.label);
  return [];
}
