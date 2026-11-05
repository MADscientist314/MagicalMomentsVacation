import { describe, expect, it } from "vitest";
import { appendBlock, AttachError, attachmentBlock, isReadableFile, readAttachment, redactionNotice, roomFor } from "../src/lib/attachments";
import { makePdf } from "./helpers/makePdf";

const file = (data: BlobPart, name: string, type = "") => new File([data], name, { type });
const page = (...lines: string[]) => lines.map((text, i) => ({ x: 72, y: 700 - i * 20, text }));

describe("readAttachment", () => {
  it("reads a supplier's PDF into a block, taking out passport numbers", async () => {
    const pdf = makePdf([page("Universal Orlando, 4 nights", "Guest passport no. 912345678", "Total: $3,450.00")]);
    const read = await readAttachment(file(pdf, "Draft itinerary.pdf", "application/pdf"), 50_000);
    expect(read.block).toBe(
      "[Attached: Draft itinerary.pdf (1 page)]\nUniversal Orlando, 4 nights\nGuest passport no. [passport number removed]\nTotal: $3,450.00\n[End of Draft itinerary.pdf]",
    );
    expect(read.notice).toBe("I took out a passport number. Those never go into the assistant.");
  });

  it("keeps whole pages that fit and says what was left out", async () => {
    const pdf = makePdf([1, 2, 3].map((n) => page(`Day ${n}: Parks and pools.`, "Dinner at the resort.", "Fireworks from the beach.")));
    const read = await readAttachment(file(pdf, "long.pdf"), 230);
    expect(read.block).toContain("(pages 1–2 of 3)");
    expect(read.block).not.toContain("Day 3");
    expect(read.notice).toBe("Only the first 2 pages of 3 fit here, so the rest was left out.");
    await expect(readAttachment(file(pdf, "long.pdf"), 100)).rejects.toThrow("There isn't room left");
  });

  it("explains a scanned PDF", async () => {
    await expect(readAttachment(file(makePdf([[]]), "scan.pdf"), 50_000)).rejects.toThrow(/looks like a scan/);
  });

  it("reads a saved email with a PDF attached to it", async () => {
    const pdf = makePdf([page("Day 1: Arrive and swim")]);
    const eml = [
      "From: Supplier <bookings@example.com>",
      "Subject: Your draft itinerary",
      'Content-Type: multipart/mixed; boundary="x"',
      "",
      "--x",
      "Content-Type: text/plain",
      "",
      "Here's the draft.",
      "--x",
      'Content-Type: application/pdf; name="draft.pdf"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(pdf).toString("base64"),
      "--x--",
    ].join("\r\n");
    const read = await readAttachment(file(eml, "Your draft itinerary.eml"), 50_000);
    expect(read.block).toBe(
      [
        "[Attached: Your draft itinerary.eml]",
        "From: Supplier <bookings@example.com>",
        "Subject: Your draft itinerary",
        "",
        "Here's the draft.",
        "",
        "[Attached: draft.pdf (1 page)]",
        "Day 1: Arrive and swim",
        "[End of draft.pdf]",
        "[End of Your draft itinerary.eml]",
      ].join("\n"),
    );
    expect(read.notice).toBeNull();
  });

  it("reads a saved web page and a text file", async () => {
    const html = await readAttachment(file("<html><body><h1>Quote</h1><p>Hard Rock, 3 nights</p></body></html>", "quote.html"), 50_000);
    expect(html.block).toBe("[Attached: quote.html]\nQuote\n\nHard Rock, 3 nights\n[End of quote.html]");
    const text = await readAttachment(file("Card 4111 1111 1111 1111 on file", "notes.txt"), 50_000);
    expect(text.block).toBe("[Attached: notes.txt]\nCard [card number removed] on file\n[End of notes.txt]");
  });

  it("explains the files it can't read", async () => {
    await expect(readAttachment(file("x", "email.msg"), 50_000)).rejects.toThrow(/Outlook .msg/);
    await expect(readAttachment(file("x", "plan.docx"), 50_000)).rejects.toThrow(/Word/);
    await expect(readAttachment(file("x", "IMG_1.HEIC", "image/heic"), 50_000)).rejects.toThrow(/pictures/);
    await expect(readAttachment(file("", "empty.pdf"), 50_000)).rejects.toBeInstanceOf(AttachError);
  });
});

describe("attachment helpers", () => {
  it("adds a block after what's in the box", () => {
    const block = attachmentBlock("a.pdf", "Text", "1 page");
    expect(appendBlock("", block)).toBe(`${block}\n`);
    expect(appendBlock("Make a proposal from this:\n\n", block)).toBe(`Make a proposal from this:\n\n${block}\n`);
    expect(roomFor("Hello  ", 100)).toBe(92);
  });

  it("knows which files it can read", () => {
    expect(isReadableFile({ name: "a.PDF", type: "" })).toBe(true);
    expect(isReadableFile({ name: "clip.png", type: "image/png" })).toBe(false);
  });

  it("words the notice about removed numbers", () => {
    expect(redactionNotice({ card: 0, ssn: 0, passport: 0 })).toBeNull();
    expect(redactionNotice({ card: 1, ssn: 0, passport: 2 })).toBe("I took out a card number and 2 passport numbers. Those never go into the assistant.");
  });
});
