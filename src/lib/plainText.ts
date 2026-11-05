// Turns pasted emails, saved HTML and email bodies into clean plain text for the assistant.
// Pure string code (no DOM), so it runs the same in the browser and in tests.

// Invisible characters email clients sprinkle in (preview padding, soft hyphens, zero-width joiners).
const INVISIBLE = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁪-⁯ㅤ﻿ﾠ]/g;
// Gmail's "[image: Image]" and Outlook's "[cid:image001.png@01DB…]" stand-ins for pictures.
const IMAGE_STAND_INS = /\[(?:image|cid):[^\]\n]*\]/gi;

/** Tidies text pasted from an email: no invisible characters or picture stand-ins, at most one blank line in a row. */
export function cleanPastedText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[   ]/g, " ")
    .replace(IMAGE_STAND_INS, "")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when text is HTML source (for example a saved email's code) rather than readable text. */
export function looksLikeHtml(text: string): boolean {
  const start = text.trimStart().slice(0, 500).toLowerCase();
  if (/^<!doctype html|^<html[\s>]|^<\?xml[^>]*>\s*<html/.test(start)) return true;
  const tags = text.match(/<\/?(?:html|head|body|div|p|br|table|tr|td|span|font|style|meta)\b[^>]*>/gi)?.length ?? 0;
  return tags >= 5 && tags * 40 > text.length / 10;
}

const NAMED: Record<string, string> = {
  nbsp: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  sbquo: "‚",
  bdquo: "„",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  deg: "°",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  times: "×",
  euro: "€",
  pound: "£",
  cent: "¢",
  shy: "",
  zwnj: "",
  zwj: "",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  laquo: "«",
  raquo: "»",
  iexcl: "¡",
  iquest: "¿",
  aacute: "á",
  eacute: "é",
  iacute: "í",
  oacute: "ó",
  uacute: "ú",
  ntilde: "ñ",
  agrave: "à",
  egrave: "è",
  ccedil: "ç",
  uuml: "ü",
  ouml: "ö",
  auml: "ä",
  Aacute: "Á",
  Eacute: "É",
  Ntilde: "Ñ",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name] ?? NAMED[name.toLowerCase()] ?? whole;
  });
}

// Block edges become markers first, so a run of them (</div><div>) is one line break, not several.
const LINE_START = "\u0001";
const LINE_END = "\u0002";
const PARA_START = "\u0003";
const PARA_END = "\u0004";
const LINE_TAGS = "div|li|tr|dt|dd|section|article|header|footer|address|center|figure|figcaption|caption|thead|tbody|tfoot";
const PARA_TAGS = "p|h[1-6]|ul|ol|dl|table|blockquote|pre|hr";
const edges = (tags: string, start: string, end: string) => (s: string) =>
  s.replace(new RegExp(`<(/?)(?:${tags})\\b[^>]*>`, "gi"), (_m, close: string) => (close ? end : start));

/** Reads an HTML email or page as plain text: paragraphs and line breaks kept, lists as bullets, table cells side by side. */
export function htmlToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(head|style|script|title|noscript|template|svg|object)\b[\s\S]*?<\/\1\s*>/gi, "")
    .replace(/<\/?(?:html|body|o:p)\b[^>]*>/gi, "");
  // Source line breaks are just spaces in HTML.
  s = s.replace(/[\r\n\t]+/g, " ");
  s = s
    .replace(/<a\b[^>]*?\bhref\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi, (_m, _q, href: string, inner: string) => {
      const text = inner.replace(/<[^>]+>/g, "").trim();
      const url = decodeEntities(href.trim());
      const showUrl = /^https?:\/\//i.test(url) && url.length <= 100 && !decodeEntities(text).includes(url.replace(/^https?:\/\//i, ""));
      return showUrl && text ? `${inner} (${url})` : inner;
    })
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, `${LINE_START}• `)
    .replace(/<\/t[dh]\s*>/gi, " | ");
  s = edges(LINE_TAGS, LINE_START, LINE_END)(edges(PARA_TAGS, PARA_START, PARA_END)(s))
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "");
  s = decodeEntities(s).replace(/(\n?)[ \u00a0]*([\u0001-\u0004][\u0001-\u0004\s]*)/g, (_m, before: string, run: string) => {
    // A <br> just before a block ends adds nothing; a <br> between blocks (Gmail's empty lines) adds a line.
    const ends = run[0] === LINE_END || run[0] === PARA_END;
    const breaks = (before && !ends ? 1 : 0) + (run.match(/\n/g)?.length ?? 0);
    return "\n".repeat(/[\u0003\u0004]/.test(run) ? Math.max(2, breaks + 1) : breaks + 1);
  });
  const lines = s.split("\n").map((line) =>
    line
      .replace(/[ \u00a0]+/g, " ")
      .replace(/(?:\s*\|\s*)+$/, "")
      .replace(/^(?:\s*\|\s*)+/, "")
      .replace(/\s*\|\s*(?:\|\s*)+/g, " | ")
      .trim(),
  );
  return cleanPastedText(lines.join("\n"));
}

/**
 * What to insert for a paste, or null to let the browser paste as usual. Steps in when the
 * clipboard only has HTML (some mail apps), when the "text" is really HTML code, or when the
 * text carries invisible characters or picture stand-ins.
 */
export function pastedText(data: { getData(type: string): string }): string | null {
  const plain = data.getData("text/plain");
  const html = data.getData("text/html");
  if (!plain.trim()) return html.trim() ? htmlToText(html) : null;
  if (looksLikeHtml(plain)) return htmlToText(plain);
  const cleaned = cleanPastedText(plain);
  return cleaned === plain.replace(/\r\n?/g, "\n").trim() ? null : cleaned;
}
