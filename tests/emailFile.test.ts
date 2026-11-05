import { describe, expect, it } from "vitest";
import { decodeHeader, looksLikeEmail, parseEml, parseHeaderValue } from "../src/lib/emailFile";

const bytes = (s: string) => new TextEncoder().encode(s);
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const GMAIL = [
  "MIME-Version: 1.0",
  "Date: Tue, 4 Nov 2026 19:02:11 -0600",
  "From: Pat Example <pat@example.com>",
  "To: Jillian <jillian@example.com>",
  "Subject: =?UTF-8?B?" + b64("Our Universal trip ✨") + "?=",
  'Content-Type: multipart/mixed; boundary="mixed"',
  "",
  "--mixed",
  'Content-Type: multipart/alternative; boundary="alt"',
  "",
  "--alt",
  'Content-Type: text/plain; charset="UTF-8"',
  "Content-Transfer-Encoding: quoted-printable",
  "",
  "Hi Jillian,=0A=0AWe=E2=80=99d love to stay at Portofino Bay for 4 nights. The quote said=",
  " $3,450.",
  "",
  "--alt",
  'Content-Type: text/html; charset="UTF-8"',
  "",
  "<div>Hi Jillian,</div><div><br></div><div>We'd love to stay at Portofino Bay for 4 nights. The quote said $3,450.</div>",
  "--alt--",
  "",
  "--mixed",
  'Content-Type: application/pdf; name="Draft itinerary.pdf"',
  'Content-Disposition: attachment; filename="Draft itinerary.pdf"',
  "Content-Transfer-Encoding: base64",
  "",
  b64("%PDF-1.4 pretend"),
  "",
  "--mixed",
  "Content-Type: image/jpeg",
  'Content-Disposition: attachment; filename="castle.jpg"',
  "Content-Transfer-Encoding: base64",
  "",
  "/9j/4AAQ",
  "--mixed--",
  "",
].join("\r\n");

describe("parseEml", () => {
  it("reads the headers and the plain-text body, and hands back attached PDFs", () => {
    const email = parseEml(bytes(GMAIL));
    expect(email.text).toBe(
      [
        "From: Pat Example <pat@example.com>",
        "To: Jillian <jillian@example.com>",
        "Date: Tue, 4 Nov 2026 19:02:11 -0600",
        "Subject: Our Universal trip ✨",
        "",
        "Hi Jillian,",
        "",
        "We’d love to stay at Portofino Bay for 4 nights. The quote said $3,450.",
      ].join("\n"),
    );
    expect(email.pdfs.map((p) => p.name)).toEqual(["Draft itinerary.pdf"]);
    expect(new TextDecoder().decode(email.pdfs[0].data)).toBe("%PDF-1.4 pretend");
    expect(email.skipped).toEqual(["castle.jpg"]);
  });

  it("reads an HTML-only email, an attached email and Windows characters", () => {
    const inner = ["From: Supplier <s@example.com>", "Subject: Draft", "Content-Type: text/plain", "", "Day 1: Arrive"].join("\r\n");
    const raw = [
      "From: John <j@example.com>",
      "Subject: Fwd: =?iso-8859-1?Q?Caf=E9_reservations?=",
      'Content-Type: multipart/mixed; boundary="b"',
      "",
      "--b",
      "Content-Type: text/html; charset=windows-1252",
      "",
      "<p>See below \x96 thanks!</p>",
      "--b",
      "Content-Type: message/rfc822",
      "",
      inner,
      "--b--",
    ].join("\r\n");
    const email = parseEml(Uint8Array.from(raw, (c) => c.charCodeAt(0)));
    expect(email.text).toContain("Subject: Fwd: Café reservations");
    expect(email.text).toContain("See below – thanks!");
    expect(email.text).toContain("---------- Attached email ----------\nFrom: Supplier <s@example.com>\nSubject: Draft\n\nDay 1: Arrive");
  });

  it("joins format=flowed lines back together", () => {
    const raw = ["Subject: Hi", 'Content-Type: text/plain; charset=utf-8; format=flowed', "", "This line goes on ", "and on.", "", "New paragraph."].join("\r\n");
    expect(parseEml(bytes(raw)).text).toBe("Subject: Hi\n\nThis line goes on and on.\n\nNew paragraph.");
  });
});

describe("header helpers", () => {
  it("decodes encoded words and RFC 2231 file names", () => {
    expect(decodeHeader("=?utf-8?q?Disney_=E2=9C=A8?= =?utf-8?q?_trip?=")).toBe("Disney ✨ trip");
    expect(parseHeaderValue("attachment; filename*=UTF-8''Itin%C3%A9raire.pdf").params.filename).toBe("Itinéraire.pdf");
    expect(parseHeaderValue('text/html; charset="utf-8"')).toEqual({ value: "text/html", params: { charset: "utf-8" } });
  });

  it("tells an email from plain text", () => {
    expect(looksLikeEmail(bytes(GMAIL))).toBe(true);
    expect(looksLikeEmail(bytes("Day 1: Arrive\nDay 2: Parks"))).toBe(false);
  });
});
