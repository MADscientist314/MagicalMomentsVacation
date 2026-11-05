import { describe, expect, it } from "vitest";
import { cleanPastedText, decodeEntities, htmlToText, looksLikeHtml, pastedText } from "../src/lib/plainText";

const clipboard = (data: Record<string, string>) => ({ getData: (type: string) => data[type] ?? "" });

describe("cleanPastedText", () => {
  it("takes out invisible characters, picture stand-ins and extra blank lines", () => {
    const pasted = "Hi Jillian,​\r\n\r\n\r\n\r\n[image: Image]\nWe'd love Universal­ in June.   \n[cid:image001.png@01DB4F]";
    expect(cleanPastedText(pasted)).toBe("Hi Jillian,\n\nWe'd love Universal in June.");
  });
});

describe("looksLikeHtml", () => {
  it("spots saved email code but not ordinary text", () => {
    expect(looksLikeHtml("<!DOCTYPE html><html><body><p>Hi</p></body></html>")).toBe(true);
    expect(looksLikeHtml('<div dir="ltr"><div>Hi</div><div><br></div><div>Thanks</div><p>x</p></div>')).toBe(true);
    expect(looksLikeHtml("Kids 6 and 9 <3 Disney, budget < $6,000")).toBe(false);
  });
});

describe("decodeEntities", () => {
  it("reads named and numbered entities", () => {
    expect(decodeEntities("Rock &amp; Roll &ndash; it&#39;s &#x2728; &nbsp;Caf&eacute; &bogus;")).toBe("Rock & Roll – it's ✨  Café &bogus;");
  });
});

describe("htmlToText", () => {
  it("keeps paragraphs, line breaks, lists and table rows", () => {
    const html = `<html><head><style>p{color:red}</style><title>x</title></head><body>
      <p>Hi Pat,</p><p>Here are your
      options:<br>Pop Century<br/>Polynesian</p>
      <ul><li>Express passes</li><li>Early entry</li></ul>
      <table><tr><td>Day 1</td><td>Arrive &amp; swim</td></tr><tr><td>Day 2</td><td>Magic Kingdom</td></tr></table>
      <script>alert(1)</script><!-- tracking --><img src="x.png">
    </body></html>`;
    expect(htmlToText(html)).toBe(
      "Hi Pat,\n\nHere are your options:\nPop Century\nPolynesian\n\n• Express passes\n• Early entry\n\nDay 1 | Arrive & swim\nDay 2 | Magic Kingdom",
    );
  });

  it("writes out a link's address unless the text already shows it", () => {
    expect(htmlToText('<p><a href="https://example.com/book">Book here</a> or <a href="https://example.com">example.com</a></p>')).toBe(
      "Book here (https://example.com/book) or example.com",
    );
  });
});

describe("pastedText", () => {
  it("lets an ordinary paste through untouched", () => {
    expect(pastedText(clipboard({ "text/plain": "Hi there", "text/html": "<p>Hi there</p>" }))).toBeNull();
  });

  it("reads the HTML when a mail app copies no plain text", () => {
    expect(pastedText(clipboard({ "text/html": "<div>Line one</div><div>Line two</div>" }))).toBe("Line one\nLine two");
  });

  it("turns pasted email code into readable text", () => {
    const code = "<!doctype html><html><body><p>Dear Jillian,</p><p>Thank you!</p></body></html>";
    expect(pastedText(clipboard({ "text/plain": code }))).toBe("Dear Jillian,\n\nThank you!");
  });

  it("cleans Gmail's picture stand-ins out of a plain paste", () => {
    expect(pastedText(clipboard({ "text/plain": "Thanks!\n[image: Logo]\nJillian" }))).toBe("Thanks!\n\nJillian");
  });
});
