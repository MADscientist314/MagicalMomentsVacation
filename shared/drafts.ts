// Saved drafts from the one-off tools, as the API returns them, plus the name each gets.
import type { Source } from "./conversations";
import { parseTripHandoff, splitDraft } from "./sections";
import type { DraftRequest, ToolId } from "./tools";

export interface SavedDraftMeta {
  id: string;
  tool: ToolId;
  title: string;
  handled: boolean;
  created_at: number;
  updated_at: number;
}

export interface SavedDraft extends SavedDraftMeta {
  /** The fields and refinements behind the draft, so a reopened draft can be refined further. */
  request: Pick<DraftRequest, "fields" | "refinements">;
  content: string;
  sources: Source[];
}

/** Trips have their own saved list, so every tool but the Adventure Planner saves drafts. */
export const SAVES_DRAFTS = (tool: ToolId) => tool !== "adventure-planner";

const firstLine = (text = "") =>
  text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean)
    ?.slice(0, 60) ?? "";

/** A name Jillian will recognize in her saved list. */
export function draftTitle(tool: ToolId, fields: Record<string, string>, content: string): string {
  const { client, internal } = splitDraft(content);
  if (tool === "welcome-center") {
    const name = parseTripHandoff(internal)?.lastName;
    return name ? `${name} family inquiry` : firstLine(fields.inquiry) || "New inquiry";
  }
  if (tool === "inbox-helper") {
    // "### Reply to Maria — Payment" (or "Reply to Maria: payment"): the name ends at the dash or colon.
    const names = [...client.matchAll(/^###\s+(?:Reply|Email) to\s+(.+?)\s*(?:[—–-]\s|:|$)/gm)].map((m) => m[1].trim());
    const quick = fields.need && fields.need !== "Reply to these emails" ? fields.need : "";
    if (quick) return `${quick} — ${names.join(", ") || firstLine(fields.emails)}`.slice(0, 120);
    return names.length ? `Replies to ${names.join(", ")}`.slice(0, 120) : firstLine(fields.emails) || "Emails";
  }
  if (tool === "magic-mail") return [fields.clientNames, fields.emailType].filter(Boolean).join(" — ") || "Email";
  if (tool === "spread-the-magic") return [fields.channel, fields.topic].filter(Boolean).join(": ") || "Post";
  return firstLine(Object.values(fields).join("\n")) || "Draft";
}
