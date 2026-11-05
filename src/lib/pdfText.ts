// Reads the text out of a PDF (a supplier's draft itinerary, a cruise confirmation) right in the
// browser, so it goes through the same checks as anything typed before it reaches the assistant.
// pdf.js is large, so it only loads the first time she attaches a PDF.

export interface TextRun {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class PdfError extends Error {}

const MESSAGES = {
  password: "That PDF is password-protected, so I can't open it. Save a copy without the password, or copy the text out of it.",
  broken: "That PDF seems to be damaged, so I can't read it. Try downloading it again.",
};

/**
 * Lays a page's text out as lines, top to bottom and left to right, whatever order the PDF stored it
 * in. Runs far apart on one line (table columns) get a wider gap; a big gap between lines a blank line.
 */
export function layoutPage(runs: TextRun[]): string {
  const sorted = runs.filter((r) => r.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextRun[][] = [];
  for (const run of sorted) {
    const line = lines.at(-1);
    const height = Math.max(1, Math.min(run.height || 10, line?.[0].height || 10));
    if (line && Math.abs(line[0].y - run.y) <= height * 0.5) line.push(run);
    else lines.push([run]);
  }
  const out: string[] = [];
  lines.forEach((line, i) => {
    line.sort((a, b) => a.x - b.x);
    let text = "";
    let end = -Infinity;
    for (const run of line) {
      const charWidth = run.width / Math.max(1, run.str.length) || run.height * 0.5;
      const gap = run.x - end;
      if (text && !/\s$/.test(text) && !/^\s/.test(run.str)) {
        if (gap > charWidth * 4) text += "   ";
        else if (gap > charWidth * 0.25) text += " ";
      }
      text += run.str;
      end = run.x + run.width;
    }
    const previous = lines[i - 1];
    if (previous && previous[0].y - line[0].y > Math.max(previous[0].height, line[0].height, 1) * 2) out.push("");
    out.push(text.replace(/[ \t]+$/, ""));
  });
  return out.join("\n").trim();
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let loading: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  loading ??= (async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // In the browser pdf.js reads in a web worker; in tests (Node) it finds its own.
    if (typeof window !== "undefined" && !pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
    }
    return pdfjs;
  })();
  loading.catch(() => (loading = null));
  return loading;
}

/** The text of each page (up to `maxPages`), and how many pages the PDF has. */
export async function pdfToText(data: Uint8Array, maxPages: number): Promise<{ pages: string[]; totalPages: number }> {
  const pdfjs = await loadPdfJs();
  const task = pdfjs.getDocument({ data, verbosity: 0, disableFontFace: true, useSystemFonts: false, enableXfa: false });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= Math.min(doc.numPages, maxPages); n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!("str" in item)) continue;
        runs.push({ str: item.str, x: item.transform[4], y: item.transform[5], width: item.width, height: item.height });
      }
      pages.push(layoutPage(runs));
      page.cleanup();
    }
    return { pages, totalPages: doc.numPages };
  } catch (err) {
    const name = (err as Error | null)?.name;
    if (name === "PasswordException") throw new PdfError(MESSAGES.password);
    if (name === "InvalidPDFException" || name === "FormatError") throw new PdfError(MESSAGES.broken);
    throw err;
  } finally {
    await task.destroy();
  }
}
