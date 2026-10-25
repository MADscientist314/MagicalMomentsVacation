// Every skill writes client-facing text first, then a "## For Jillian only"
// heading followed by internal notes. Trip plans ("### Day …") and Inbox Helper
// replies ("### Reply to …") come as "### " blocks that can each be copied.

import { TOOLS } from "./tools";

const NOTES_MARKER = /^##\s+For Jillian only\s*$/im;
const BLOCK_HEADING = /^###\s+(.+)$/gm;

export function splitDraft(md: string): {
  client: string;
  internal: string;
  blocks: { title: string; body: string }[];
} {
  const marker = NOTES_MARKER.exec(md);
  const client = (marker ? md.slice(0, marker.index) : md).trim();
  const internal = marker ? md.slice(marker.index + marker[0].length).trim() : "";

  const headings = [...client.matchAll(BLOCK_HEADING)];
  const blocks = headings.map((h, i) => {
    const start = h.index + h[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : client.length;
    return { title: h[1].trim(), body: client.slice(start, end).trim() };
  });

  return { client, internal, blocks };
}

const SUBJECT_LINE = /^\*\*Subject:\*\*\s*(.+?)\s*(?:\r?\n|$)/;

export function splitSubject(client: string): { subject: string | null; body: string } {
  const m = SUBJECT_LINE.exec(client);
  return m ? { subject: m[1], body: client.slice(m[0].length).trim() } : { subject: null, body: client };
}

export interface TripHandoff {
  lastName: string;
  destination: string;
  dates: string;
  party: string;
  priorities: string;
  summary: string;
}

const HANDOFF_LINES: Record<string, keyof TripHandoff> = {
  "client last name": "lastName",
  destination: "destination",
  dates: "dates",
  "who's going": "party",
  priorities: "priorities",
  summary: "summary",
};

/** Reads Welcome Center's "Trip hand-off" block, so Jillian can start a trip from an inquiry. */
export function parseTripHandoff(internal: string): TripHandoff | null {
  const start = internal.search(/\*\*Trip hand-off\*\*/i);
  if (start < 0) return null;
  const out: TripHandoff = { lastName: "", destination: "", dates: "", party: "", priorities: "", summary: "" };
  for (const line of internal.slice(start).split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const m = /^\s*[-*]\s*([^:]+):\s*(.*)$/.exec(line);
    if (!m) break;
    const key = HANDOFF_LINES[m[1].trim().toLowerCase().replace(/[’]/g, "'")];
    const value = m[2].trim();
    if (key && !/^\(?unknown\)?$/i.test(value)) out[key] = value;
  }
  const destinations = TOOLS["adventure-planner"].fields.find((f) => f.id === "destination")?.options ?? [];
  if (!destinations.includes(out.destination)) out.destination = "";
  return out.lastName ? out : null;
}
