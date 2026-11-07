// Trip files: what Jillian keeps with a trip (supplier itineraries, confirmations, invoices, the family's
// emails). Stored in R2 next to the trip's photos, private to her, and never sent to the assistant.

/** About the size of an email attachment limit; supplier PDFs are usually far smaller. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_FILES_PER_TRIP = 200;
export const MAX_FILE_NAME = 150;

export interface TripFile {
  id: string;
  name: string;
  mime: string;
  bytes: number;
  created_at: number;
}

/** Types a browser tab can show safely: PDFs and photos (only when the bytes really are one). */
export const VIEWABLE = new Set(["application/pdf", "image/jpeg", "image/png", "image/gif", "image/webp"]);

/** A name to show and save under: no folders or control characters, at most MAX_FILE_NAME (keeping the extension). */
export function cleanFileName(raw: string): string {
  const base = (raw.split(/[/\\]/).pop() ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const name = base || "file";
  if (name.length <= MAX_FILE_NAME) return name;
  const ext = /\.[A-Za-z0-9]{1,10}$/.exec(name)?.[0] ?? "";
  return name.slice(0, MAX_FILE_NAME - ext.length).trimEnd() + ext;
}

/** "830 KB", "2.4 MB". */
export function formatBytes(n: number): string {
  if (n < 1024) return `${n} bytes`;
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
