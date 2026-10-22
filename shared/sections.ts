// Every skill writes client-facing text first, then a "## For Jillian only"
// heading followed by internal notes. Trip plans use "### Day …" blocks.

const NOTES_MARKER = /^##\s+For Jillian only\s*$/im;
const DAY_HEADING = /^###\s+(Day\b.*)$/gim;

export function splitDraft(md: string): {
  client: string;
  internal: string;
  days: { title: string; body: string }[];
} {
  const marker = NOTES_MARKER.exec(md);
  const client = (marker ? md.slice(0, marker.index) : md).trim();
  const internal = marker ? md.slice(marker.index + marker[0].length).trim() : "";

  const headings = [...client.matchAll(DAY_HEADING)];
  const days = headings.map((h, i) => {
    const start = h.index + h[0].length;
    const end = i + 1 < headings.length ? headings[i + 1].index : client.length;
    return { title: h[1].trim(), body: client.slice(start, end).trim() };
  });

  return { client, internal, days };
}
