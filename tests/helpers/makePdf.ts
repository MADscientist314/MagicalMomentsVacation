// Builds a small, valid PDF for tests: each page is a list of text runs at (x, y) in points,
// written in the order given (so a test can put a page's runs out of reading order).

export interface Run {
  x: number;
  y: number;
  text: string;
  size?: number;
}

const escapePdf = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

export function makePdf(pages: Run[][]): Uint8Array<ArrayBuffer> {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body);
  // 1: catalog, 2: page tree, 3: font, then a page object and a content stream for each page.
  const pageIds = pages.map((_, i) => 4 + i * 2);
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`);
  add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pages.forEach((runs, i) => {
    const stream = runs.map((r) => `BT /F1 ${r.size ?? 12} Tf ${r.x} ${r.y} Td (${escapePdf(r.text)}) Tj ET`).join("\n");
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageIds[i] + 1} 0 R >>`);
    add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  });
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // Latin-1 bytes, one per character, which is what the PDF's WinAnsi font expects.
  return Uint8Array.from(out, (c) => c.charCodeAt(0) & 0xff);
}
