// Turns a file Jillian attaches (a supplier's PDF itinerary, a saved email, a web page) into text for
// the message box. Card, SSN and passport numbers are taken out before the text ever reaches the box.
import { redactSensitive, type SensitiveKind } from "../../shared/guard";
import { looksLikeEmail, parseEml } from "./emailFile";
import { PdfError, pdfToText } from "./pdfText";
import { cleanPastedText, htmlToText, looksLikeHtml } from "./plainText";

export const ATTACH_ACCEPT = ".pdf,.eml,.mht,.mhtml,.html,.htm,.txt,application/pdf,message/rfc822,text/html,text/plain";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_PDF_PAGES = 40;

export class AttachError extends Error {}

export interface Attachment {
  /** "[Attached: name]", the file's text, then "[End of name]". */
  block: string;
  /** What to tell her (numbers taken out, pages left out), or null. */
  notice: string | null;
}

type Kind = "pdf" | "eml" | "html" | "text";

const extension = (name: string) => /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? "";

function readableKind(name: string, type: string): Kind | null {
  const ext = extension(name);
  if (ext === "pdf" || type === "application/pdf") return "pdf";
  if (ext === "eml" || ext === "mht" || ext === "mhtml" || type === "message/rfc822") return "eml";
  if (ext === "html" || ext === "htm" || type === "text/html") return "html";
  if (ext === "txt" || ext === "text" || type === "text/plain") return "text";
  return null;
}

/** True for the files she can attach (so a paste of a PDF attaches it, but a pasted picture doesn't). */
export const isReadableFile = (file: { name: string; type: string }) => readableKind(file.name, file.type) !== null;

function kindOf(name: string, type: string): Kind {
  const kind = readableKind(name, type);
  if (kind) return kind;
  const ext = extension(name);
  if (ext === "msg") {
    throw new AttachError("I can't open Outlook .msg files. Open the email, copy its text and paste it here, or save it as an .eml file and attach that.");
  }
  if (["doc", "docx", "pages", "rtf", "odt"].includes(ext)) {
    throw new AttachError("I can't open Word or Pages files yet. Save it as a PDF and attach that, or paste the text in.");
  }
  if (type.startsWith("image/") || ["jpg", "jpeg", "png", "gif", "heic", "heif", "webp", "tif", "tiff"].includes(ext)) {
    throw new AttachError("I can't read pictures here. If it's a screenshot of an itinerary, attach the PDF or paste the text instead.");
  }
  throw new AttachError("I can read PDFs, saved emails (.eml), web pages (.html) and text files. Paste the text in instead.");
}

const NAMES: Record<SensitiveKind, [string, string]> = {
  card: ["a card number", "card numbers"],
  ssn: ["a Social Security number", "Social Security numbers"],
  passport: ["a passport number", "passport numbers"],
};

/** "I took out 2 passport numbers and a card number…", or null when nothing was taken out. */
export function redactionNotice(removed: Record<SensitiveKind, number>): string | null {
  const parts = (Object.keys(NAMES) as SensitiveKind[])
    .filter((k) => removed[k] > 0)
    .map((k) => (removed[k] === 1 ? NAMES[k][0] : `${removed[k]} ${NAMES[k][1]}`));
  if (!parts.length) return null;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
  return `I took out ${list}. Those never go into the assistant.`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export const attachmentBlock = (name: string, text: string, detail?: string) =>
  `[Attached: ${name}${detail ? ` (${detail})` : ""}]\n${text.trim()}\n[End of ${name}]`;

/** Adds a block after whatever is already in the box, with a blank line between. */
export function appendBlock(current: string, block: string): string {
  const before = current.replace(/\s+$/, "");
  return before ? `${before}\n\n${block}\n` : `${block}\n`;
}

/** How many characters a new block can use in a box holding `current`. */
export const roomFor = (current: string, limit: number) => limit - current.replace(/\s+$/, "").length - 3;

const NO_ROOM = "There isn't room left in this box for that file. Clear some of the text, or send what's there first.";
const CUT = "\n[…the rest didn't fit]";

function decodeText(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const declared = /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  if (declared) {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Unknown label: fall through.
    }
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** Cuts text to fit, at a paragraph or line break when there's one near the end. */
function fit(text: string, room: number): { text: string; cut: boolean } {
  if (text.length <= room) return { text, cut: false };
  const limit = room - CUT.length;
  let end = text.lastIndexOf("\n\n", limit);
  if (end < limit * 0.7) end = text.lastIndexOf("\n", limit);
  if (end < limit * 0.7) end = limit;
  return { text: text.slice(0, end).trimEnd() + CUT, cut: true };
}

async function pdfPages(bytes: Uint8Array): Promise<{ pages: { text: string; removed: Record<SensitiveKind, number> }[]; totalPages: number }> {
  if (!new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF")) {
    throw new AttachError("That file doesn't look like a PDF, so I can't read it.");
  }
  let read: { pages: string[]; totalPages: number };
  try {
    read = await pdfToText(bytes, MAX_PDF_PAGES);
  } catch (err) {
    if (err instanceof PdfError) throw new AttachError(err.message);
    throw err;
  }
  // A scan has no text layer: at most a page number or a stamp on each page.
  if (read.pages.join("").replace(/\s/g, "").length < 15 * Math.max(1, read.pages.length)) {
    throw new AttachError("That PDF looks like a scan (pictures of pages), so there's no text in it I can read. Ask the supplier for the original PDF, or paste the text in.");
  }
  return { pages: read.pages.map((p) => redactSensitive(p)), totalPages: read.totalPages };
}

const addCounts = (a: Record<SensitiveKind, number>, b: Record<SensitiveKind, number>) => ({
  card: a.card + b.card,
  ssn: a.ssn + b.ssn,
  passport: a.passport + b.passport,
});

async function readPdf(name: string, bytes: Uint8Array, room: number): Promise<Attachment> {
  const { pages, totalPages } = await pdfPages(bytes);
  const build = (n: number) =>
    attachmentBlock(
      name,
      pages
        .slice(0, n)
        .map((p) => p.text)
        .join("\n\n"),
      n < totalPages ? `pages 1–${n} of ${totalPages}` : plural(totalPages, "page"),
    );
  let used = pages.length;
  while (used > 0 && build(used).length > room) used--;
  if (!used) throw new AttachError(NO_ROOM);
  const notes: string[] = [];
  if (used < pages.length) notes.push(`Only the first ${plural(used, "page")} of ${totalPages} fit here, so the rest was left out.`);
  else if (totalPages > pages.length) notes.push(`I read the first ${pages.length} of its ${totalPages} pages.`);
  const removed = redactionNotice(pages.slice(0, used).reduce((sum, p) => addCounts(sum, p.removed), { card: 0, ssn: 0, passport: 0 }));
  if (removed) notes.unshift(removed);
  return { block: build(used), notice: notes.join(" ") || null };
}

async function readEmailFile(name: string, bytes: Uint8Array, room: number): Promise<Attachment> {
  const email = parseEml(bytes);
  const pieces = [email.text];
  const notes: string[] = [];
  let removed = { card: 0, ssn: 0, passport: 0 };
  for (const pdf of email.pdfs) {
    try {
      const { pages, totalPages } = await pdfPages(pdf.data);
      const detail = totalPages > pages.length ? `pages 1–${pages.length} of ${totalPages}` : plural(totalPages, "page");
      pieces.push(attachmentBlock(pdf.name, pages.map((p) => p.text).join("\n\n"), detail));
      removed = pages.reduce((sum, p) => addCounts(sum, p.removed), removed);
    } catch (err) {
      if (!(err instanceof AttachError)) throw err;
      notes.push(`I couldn't read ${pdf.name} from that email: ${err.message}`);
    }
  }
  if (email.skipped.length) notes.push(`Its other attachments (${email.skipped.join(", ")}) can't be read here, so they were left out.`);
  return finish(name, pieces.join("\n\n"), room, notes, removed);
}

/** Takes out sensitive numbers, fits the text to the room left and wraps it in a block. */
function finish(
  name: string,
  text: string,
  room: number,
  notes: string[] = [],
  alreadyRemoved = { card: 0, ssn: 0, passport: 0 },
): Attachment {
  const clean = redactSensitive(text);
  if (!clean.text.trim()) throw new AttachError("I couldn't find any text in that file.");
  const frame = attachmentBlock(name, "").length;
  if (room - frame < 200) throw new AttachError(NO_ROOM);
  const fitted = fit(clean.text.trim(), room - frame);
  const removed = redactionNotice(addCounts(clean.removed, alreadyRemoved));
  return {
    block: attachmentBlock(name, fitted.text),
    notice: [removed, ...notes, fitted.cut ? "It was too long to fit here, so the end was left out." : null].filter(Boolean).join(" ") || null,
  };
}

/** Reads one attached file into a block of at most `room` characters. */
export async function readAttachment(file: Blob & { name: string }, room: number): Promise<Attachment> {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new AttachError("That file is over 25 MB, which is too big to read here.");
  if (!file.size) throw new AttachError("That file is empty.");
  const kind = kindOf(file.name, file.type);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (kind === "pdf") return readPdf(file.name, bytes, room);
  if (kind === "eml" || (kind === "text" && looksLikeEmail(bytes))) return readEmailFile(file.name, bytes, room);
  const text = decodeText(bytes);
  return finish(file.name, kind === "html" || looksLikeHtml(text) ? htmlToText(text) : cleanPastedText(text), room);
}
