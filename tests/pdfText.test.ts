import { describe, expect, it } from "vitest";
import { layoutPage, pdfToText, PdfError } from "../src/lib/pdfText";
import { makePdf } from "./helpers/makePdf";

describe("layoutPage", () => {
  it("puts runs in reading order, whatever order the PDF stored them", () => {
    const run = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 6, height: 12 });
    const text = layoutPage([run("Check in", 300, 700), run("Day 1", 72, 700), run("Price: $4,200", 72, 680), run("Itinerary", 72, 740)]);
    expect(text).toBe("Itinerary\n\nDay 1   Check in\nPrice: $4,200");
  });

  it("joins pieces of one word and spaces separate words", () => {
    const text = layoutPage([
      { str: "Portofino", x: 72, y: 700, width: 54, height: 12 },
      { str: "Bay", x: 129.5, y: 700.4, width: 18, height: 12 },
      { str: "Ho", x: 150, y: 700, width: 12, height: 12 },
      { str: "tel", x: 162, y: 700, width: 18, height: 12 },
    ]);
    expect(text).toBe("Portofino Bay Hotel");
  });
});

describe("pdfToText", () => {
  it("reads each page of a PDF", async () => {
    const pdf = makePdf([
      [
        { x: 300, y: 700, text: "Check in at Portofino Bay" },
        { x: 72, y: 700, text: "Day 1 (Sat)" },
        { x: 72, y: 740, text: "Universal Orlando draft itinerary", size: 18 },
      ],
      [{ x: 72, y: 700, text: "Day 2 (Sun) Islands of Adventure" }],
    ]);
    const { pages, totalPages } = await pdfToText(pdf, 40);
    expect(totalPages).toBe(2);
    expect(pages[0]).toBe("Universal Orlando draft itinerary\n\nDay 1 (Sat)   Check in at Portofino Bay");
    expect(pages[1]).toBe("Day 2 (Sun) Islands of Adventure");
  });

  it("stops at the page limit but says how many pages there are", async () => {
    const pdf = makePdf([1, 2, 3].map((n) => [{ x: 72, y: 700, text: `Page ${n}` }]));
    expect(await pdfToText(pdf, 2)).toEqual({ pages: ["Page 1", "Page 2"], totalPages: 3 });
  });

  it("explains a file that isn't really a PDF", async () => {
    await expect(pdfToText(new TextEncoder().encode("%PDF-1.4 nothing here"), 40)).rejects.toBeInstanceOf(PdfError);
  });
});
