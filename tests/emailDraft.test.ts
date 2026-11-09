import { describe, expect, it, vi } from "vitest";
import type { Proposal } from "../shared/deliverables";
import { splitSubject } from "../shared/sections";
import { defaultEmailKinds, emailRequest, latestByKind, linksAsText, quoteSummary } from "../src/lib/emailDraft";
import { filesToAttach, pictureName } from "../src/lib/attachments";
import { plainText } from "../src/components/CopyButton";

vi.mock("../src/lib/markdown", () => ({ renderMarkdown: (md: string) => md }));

const meta = (kind: "proposal" | "itinerary" | "estimate" | "extras", version: number) => ({ id: `${kind}-${version}`, kind, version, created_at: version });

const PROPOSAL: Proposal = {
  title: "Your Universal trip",
  intro: "",
  options: [
    {
      name: "Portofino Bay",
      summary: "",
      highlights: [],
      bestFor: "",
      price: {
        amount: 2799.93,
        note: "3 nights",
        lines: [
          { label: "Hotel, 3 nights", qty: 1, unitPrice: 2140 },
          { label: "Park tickets", qty: 7, unitPrice: 129.99 },
          { label: "Resident discount", qty: 1, unitPrice: -250 },
        ],
      },
    },
    { name: "Hard Rock", summary: "", highlights: [], bestFor: "", price: { amount: null, note: "" } },
  ],
  recommendation: "",
  nextSteps: [],
  verifyNotes: [],
};

describe("Draft the email", () => {
  it("links the newest version of each document, the proposal and itinerary by default", () => {
    const latest = latestByKind([meta("proposal", 1), meta("proposal", 3), meta("itinerary", 2), meta("extras", 1)]);
    expect(latest.proposal?.version).toBe(3);
    expect(defaultEmailKinds(latest)).toEqual(["proposal", "itinerary"]);
    expect(defaultEmailKinds(latestByKind([meta("extras", 1)]))).toEqual(["extras"]);
  });

  it("sums up the quote with code, so the email never does the math", () => {
    expect(quoteSummary(PROPOSAL)).toBe(
      [
        "Option 1: Portofino Bay, total $2,799.93 (3 nights)",
        "- Hotel, 3 nights: $2,140.00",
        "- Park tickets (7 × $129.99): $909.93",
        "- Resident discount: -$250.00",
        "",
        "Option 2: Hard Rock, total [price still to add]",
      ].join("\n"),
    );
  });

  it("asks in one line, with the links and the quote folded into blocks", () => {
    const text = emailRequest({
      links: [
        { kind: "proposal", version: 3, url: "https://magicalvacations.pilotandproof.com/p/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
        { kind: "itinerary", version: 2, url: "https://magicalvacations.pilotandproof.com/p/BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB" },
      ],
      expiresOn: "Wednesday, December 9",
      quote: { version: 3, proposal: PROPOSAL },
      ask: "Mention the deposit is due Friday.",
    });
    expect(text.split("\n")[0]).toBe(
      "Please draft my email to the family with their proposal and itinerary links and a short summary of the quote. Mention the deposit is due Friday.",
    );
    expect(text).toContain("[Attached: Links for the family]\nProposal (version 3): https://magicalvacations.pilotandproof.com/p/AAAA");
    expect(text).toContain("The links work until Wednesday, December 9.\n[End of Links for the family]");
    expect(text).toContain("[Attached: Quote from proposal v3]\nOption 1: Portofino Bay");
  });

  it("finds the subject of the email that comes back, and copies its links as plain text", () => {
    const reply = "**Subject:** Your Universal proposal is ready!\n\nHi Rivera family,\n\n[View your proposal](https://x.test/p/abc)";
    const { subject, body } = splitSubject(reply);
    expect(subject).toBe("Your Universal proposal is ready!");
    expect(linksAsText(body)).toContain("View your proposal: https://x.test/p/abc");
    expect(plainText("**Total:** [View it](https://x.test/p/abc)")).toBe("Total: View it: https://x.test/p/abc");
  });
});

describe("pasting a screenshot", () => {
  const clipboard = (files: File[], data: Record<string, string> = {}) => ({ files: files as unknown as FileList, getData: (t: string) => data[t] ?? "" });
  const png = new File(["x"], "image.png", { type: "image/png" });

  it("attaches a screenshot from the clipboard, but pastes the text when Word or Excel sent a picture of it too", () => {
    expect(filesToAttach(clipboard([png]))).toEqual([png]);
    expect(filesToAttach(clipboard([png], { "text/html": '<meta charset="utf-8"><img src="https://x.test/a.png">' }))).toEqual([png]);
    expect(filesToAttach(clipboard([png], { "text/html": "<table><tr><td>Hotel</td><td>$2,140</td></tr></table>", "text/plain": "Hotel\t$2,140" }))).toEqual([]);
    expect(filesToAttach(clipboard([new File(["x"], "plan.docx")]))).toEqual([]);
  });

  it("names a pasted picture by the time it was pasted", () => {
    expect(pictureName("Screenshot 2026-11-08 at 9.14.22 PM.png")).toBe("Screenshot 2026-11-08 at 9.14.22 PM.png");
    expect(pictureName("image.png", new Date(2026, 10, 9, 21, 14, 5))).toBe("Pasted screenshot 9:14:05 PM");
  });
});
