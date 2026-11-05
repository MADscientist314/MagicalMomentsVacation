// Reads a saved email (.eml: Gmail's "Download message", Apple Mail and Outlook "Save as") as
// plain text, and hands back any PDFs attached to it so they can be read too. Pure code, no DOM.
import { cleanPastedText, htmlToText } from "./plainText";

export interface ParsedEmail {
  /** From, To, Date and Subject lines, then the message itself. */
  text: string;
  pdfs: { name: string; data: Uint8Array }[];
  /** Names of attachments that can't be read here (pictures, Word files…). */
  skipped: string[];
}

interface Part {
  headers: Map<string, string>;
  body: string; // raw bytes, one character per byte
}

const latin1 = (bytes: Uint8Array) => {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};
const toBytes = (raw: string) => Uint8Array.from(raw, (c) => c.charCodeAt(0) & 0xff);

function decodeBytes(bytes: Uint8Array, charset = "utf-8"): string {
  const label = charset.trim().toLowerCase().replace(/^"|"$/g, "") || "utf-8";
  try {
    return new TextDecoder(label === "us-ascii" || label === "ascii" ? "windows-1252" : label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function splitHead(raw: string): { head: string; body: string } {
  const match = /\r?\n\r?\n/.exec(raw);
  return match ? { head: raw.slice(0, match.index), body: raw.slice(match.index + match[0].length) } : { head: raw, body: "" };
}

function parseHeaders(head: string): Map<string, string> {
  const headers = new Map<string, string>();
  for (const line of head.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const colon = line.indexOf(":");
    if (colon > 0) {
      const name = line.slice(0, colon).trim().toLowerCase();
      if (!headers.has(name)) headers.set(name, line.slice(colon + 1).trim());
    }
  }
  return headers;
}

/** "text/html; charset=utf-8; name*=UTF-8''It%C3%A9n.pdf" → value plus lower-cased parameters. */
export function parseHeaderValue(value: string): { value: string; params: Record<string, string> } {
  const [first, ...rest] = value.split(/;(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const params: Record<string, string> = {};
  for (const piece of rest) {
    const eq = piece.indexOf("=");
    if (eq < 0) continue;
    let name = piece.slice(0, eq).trim().toLowerCase();
    let v = piece.slice(eq + 1).trim().replace(/^"(.*)"$/s, "$1");
    if (name.endsWith("*")) {
      // RFC 2231: charset'language'percent-encoded.
      name = name.slice(0, -1);
      const m = /^([^']*)'[^']*'(.*)$/.exec(v);
      if (m) {
        v = decodeBytes(toBytes(m[2].replace(/%([0-9a-f]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16)))), m[1] || "utf-8");
      }
    }
    params[name] = v;
  }
  return { value: first.trim().toLowerCase(), params };
}

/** Decodes =?utf-8?B?…?= and =?iso-8859-1?Q?…?= words; plain bytes are read as UTF-8 when they can be. */
export function decodeHeader(raw: string): string {
  const words = raw.replace(/(=\?[^?]+\?[bq]\?[^?]*\?=)\s+(?==\?)/gi, "$1");
  return words
    .split(/(=\?[^?]+\?[bq]\?[^?]*\?=)/i)
    .map((piece) => {
      const m = /^=\?([^?*]+)(?:\*[^?]*)?\?([bq])\?([^?]*)\?=$/i.exec(piece);
      // Already-decoded text (an RFC 2231 file name) is left alone.
      if (!m) return /[^\x00-\xff]/.test(piece) ? piece : decodeBytes(toBytes(piece));
      const [, charset, encoding, text] = m;
      const bytes =
        encoding.toLowerCase() === "b"
          ? base64Bytes(text)
          : toBytes(text.replace(/_/g, " ").replace(/=([0-9a-f]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))));
      return decodeBytes(bytes, charset);
    })
    .join("");
}

function base64Bytes(text: string): Uint8Array {
  let clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  if (clean.length % 4 === 1) clean = clean.slice(0, -1);
  try {
    return toBytes(atob(clean + "=".repeat((4 - (clean.length % 4)) % 4)));
  } catch {
    return new Uint8Array();
  }
}

function transferDecode(body: string, encoding: string): Uint8Array {
  const e = encoding.trim().toLowerCase();
  if (e === "base64") return base64Bytes(body);
  if (e === "quoted-printable") {
    return toBytes(body.replace(/=\r?\n/g, "").replace(/=([0-9a-f]{2})/gi, (_x, h: string) => String.fromCharCode(parseInt(h, 16))));
  }
  return toBytes(body);
}

function splitMultipart(body: string, boundary: string): string[] {
  const parts: string[] = [];
  const delimiter = `--${boundary}`;
  const lines = body.split(/\r?\n/);
  let current: string[] | null = null;
  for (const line of lines) {
    if (line.startsWith(delimiter)) {
      if (current) parts.push(current.join("\r\n"));
      if (line.slice(delimiter.length).startsWith("--")) return parts;
      current = [];
    } else {
      current?.push(line);
    }
  }
  if (current?.length) parts.push(current.join("\r\n"));
  return parts;
}

function parsePart(raw: string): Part {
  const { head, body } = splitHead(raw);
  return { headers: parseHeaders(head), body };
}

interface Found {
  texts: string[];
  pdfs: ParsedEmail["pdfs"];
  skipped: string[];
}

function fileName(part: Part): string {
  const disposition = parseHeaderValue(part.headers.get("content-disposition") ?? "");
  const type = parseHeaderValue(part.headers.get("content-type") ?? "");
  return decodeHeader(disposition.params.filename ?? type.params.name ?? "").trim();
}

function textOf(part: Part, type: { value: string; params: Record<string, string> }): string {
  const bytes = transferDecode(part.body, part.headers.get("content-transfer-encoding") ?? "");
  let text = decodeBytes(bytes, type.params.charset);
  if (type.value === "text/html") return htmlToText(text);
  // format=flowed (Apple Mail, Thunderbird): a line ending in a space continues on the next one.
  if (type.params.format?.toLowerCase() === "flowed") {
    text = text.replace(/ \r?\n(?!-- )/g, type.params.delsp?.toLowerCase() === "yes" ? "" : " ");
  }
  return cleanPastedText(text);
}

function walk(part: Part, found: Found, depth = 0): void {
  if (depth > 10) return;
  const type = parseHeaderValue(part.headers.get("content-type") ?? "text/plain");
  const disposition = parseHeaderValue(part.headers.get("content-disposition") ?? "").value;
  const name = fileName(part);

  if (type.value.startsWith("multipart/") && type.params.boundary) {
    const children = splitMultipart(part.body, type.params.boundary).map(parsePart);
    if (type.value === "multipart/alternative") {
      // Each child is the same message: take the plain text unless it's missing or clearly cut short.
      const versions = children.map((child) => {
        const sub: Found = { texts: [], pdfs: found.pdfs, skipped: found.skipped };
        walk(child, sub, depth + 1);
        return { html: /html/.test(child.headers.get("content-type") ?? "") || /multipart\/related/.test(child.headers.get("content-type") ?? ""), text: sub.texts.join("\n\n") };
      });
      const plain = versions.find((v) => !v.html && v.text.trim());
      const html = versions.find((v) => v.html && v.text.trim());
      const best = plain && (!html || plain.text.length >= html.text.length * 0.5) ? plain : (html ?? plain);
      if (best) found.texts.push(best.text);
      return;
    }
    for (const child of children) walk(child, found, depth + 1);
    return;
  }

  if (type.value === "message/rfc822") {
    const inner = readEmail(transferDecode(part.body, part.headers.get("content-transfer-encoding") ?? ""), depth + 1);
    found.texts.push(`---------- Attached email ----------\n${inner.text}`);
    found.pdfs.push(...inner.pdfs);
    found.skipped.push(...inner.skipped);
    return;
  }

  const isPdf = type.value === "application/pdf" || /\.pdf$/i.test(name);
  if (isPdf) {
    found.pdfs.push({ name: name || "attachment.pdf", data: transferDecode(part.body, part.headers.get("content-transfer-encoding") ?? "") });
    return;
  }
  const isText = type.value === "text/plain" || type.value === "text/html" || type.value.startsWith("multipart/");
  if (isText && disposition !== "attachment") {
    const text = textOf(part, type);
    if (text) found.texts.push(text);
    return;
  }
  // Inline pictures (logos, signatures) are noise; only name real attachments.
  if (disposition === "attachment" && name) found.skipped.push(name);
}

function readEmail(bytes: Uint8Array, depth: number): ParsedEmail {
  const part = parsePart(latin1(bytes));
  const found: Found = { texts: [], pdfs: [], skipped: [] };
  walk(part, found, depth);
  const header = (["from", "to", "cc", "date", "subject"] as const)
    .map((h) => [h, part.headers.get(h)] as const)
    .filter(([, v]) => v)
    .map(([h, v]) => `${h[0].toUpperCase()}${h.slice(1)}: ${decodeHeader(v!)}`);
  const body = found.texts.filter((t) => t.trim()).join("\n\n");
  return { text: cleanPastedText([...header, "", body].join("\n")), pdfs: found.pdfs, skipped: found.skipped };
}

export function parseEml(bytes: Uint8Array): ParsedEmail {
  return readEmail(bytes, 0);
}

/** True when the bytes start like an email (a few "Name: value" header lines). */
export function looksLikeEmail(bytes: Uint8Array): boolean {
  const start = latin1(bytes.subarray(0, 4096));
  const headers = parseHeaders(splitHead(start).head);
  return ["from", "to", "subject", "date", "content-type", "mime-version", "received"].filter((h) => headers.has(h)).length >= 2;
}
