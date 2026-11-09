// "Draft the email": the message the Planning page sends to the trip chat, asking for the email to the
// family with the documents' private links and the quote's totals. The links and the money are written
// here, by code, so the assistant only has to put them into words (brains/skills/adventure-planner).
import type { DeliverableMeta } from "../../shared/conversations";
import { DELIVERABLE_LABELS, money, optionTotal, type DeliverableKind, type Proposal } from "../../shared/deliverables";

/** The order documents are offered and linked in. */
export const EMAIL_KINDS: DeliverableKind[] = ["proposal", "itinerary", "estimate", "extras"];
export const LINKS_BLOCK = "Links for the family";

/** The newest version of each kind of document the trip has. */
export function latestByKind(deliverables: DeliverableMeta[]): Partial<Record<DeliverableKind, DeliverableMeta>> {
  const latest: Partial<Record<DeliverableKind, DeliverableMeta>> = {};
  for (const d of deliverables) {
    const seen = latest[d.kind];
    if (!seen || d.version > seen.version) latest[d.kind] = d;
  }
  return latest;
}

/** What's ticked when the email chooser opens: the proposal and the itinerary, or whatever there is. */
export function defaultEmailKinds(latest: Partial<Record<DeliverableKind, DeliverableMeta>>): DeliverableKind[] {
  const main = (["proposal", "itinerary"] as const).filter((k) => latest[k]);
  return main.length ? main : EMAIL_KINDS.filter((k) => latest[k]).slice(0, 1);
}

/** "Option 1: Portofino Bay, total $6,842.10 (3 nights…)" with its breakdown lines underneath. */
export function quoteSummary(p: Proposal): string {
  return p.options
    .map((o, i) => {
      const { total, itemized } = optionTotal(o.price);
      const head = `${p.options.length > 1 ? `Option ${i + 1}: ` : ""}${o.name}, total ${total === null ? "[price still to add]" : money(total)}${
        o.price.note.trim() ? ` (${o.price.note.trim()})` : ""
      }`;
      if (!itemized) return head;
      const lines = (o.price.lines ?? []).map((l) => {
        const each = l.qty !== 1 && l.unitPrice !== null ? ` (${l.qty} × ${money(l.unitPrice)})` : "";
        return `- ${l.label}${each}: ${l.unitPrice === null ? "[price still to add]" : money(l.qty * l.unitPrice)}`;
      });
      return [head, ...lines].join("\n");
    })
    .join("\n\n");
}

const listOf = (words: string[]) => (words.length < 3 ? words.join(" and ") : `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`);

export interface EmailLink {
  kind: DeliverableKind;
  version: number;
  url: string;
}

/** The message that asks for the email. Its blocks fold away in the chat, under her one-line ask. */
export function emailRequest(opts: { links: EmailLink[]; expiresOn: string; quote?: { version: number; proposal: Proposal }; ask?: string }): string {
  const names = opts.links.map((l) => `${DELIVERABLE_LABELS[l.kind].toLowerCase()}`);
  const ask = opts.ask?.trim();
  const parts = [
    `Please draft my email to the family with their ${listOf(names)} link${names.length === 1 ? "" : "s"}${opts.quote ? " and a short summary of the quote" : ""}.${
      ask ? ` ${ask}` : ""
    }`,
    `[Attached: ${LINKS_BLOCK}]\n${opts.links
      .map((l) => `${DELIVERABLE_LABELS[l.kind]} (version ${l.version}): ${l.url}`)
      .join("\n")}\nThe links work until ${opts.expiresOn}.\n[End of ${LINKS_BLOCK}]`,
  ];
  if (opts.quote) {
    const name = `Quote from proposal v${opts.quote.version}`;
    parts.push(`[Attached: ${name}]\n${quoteSummary(opts.quote.proposal)}\n[End of ${name}]`);
  }
  return parts.join("\n\n");
}

/** "Plain text" for a pasted email: markdown links become "text: address". */
export const linksAsText = (md: string) => md.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1: $2");
