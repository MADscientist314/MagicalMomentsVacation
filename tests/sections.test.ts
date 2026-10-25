import { describe, expect, it } from "vitest";
import { parseTripHandoff, splitDraft, splitSubject } from "../shared/sections";

describe("splitDraft", () => {
  it("separates client text from Jillian-only notes", () => {
    const parts = splitDraft("Hi!\n\n## For Jillian only\n- verify price");
    expect(parts.client).toBe("Hi!");
    expect(parts.internal).toBe("- verify price");
  });

  it("returns empty internal notes when there is no marker", () => {
    expect(splitDraft("Just the email").internal).toBe("");
  });

  it("finds day blocks in the client text", () => {
    const parts = splitDraft("### Day 1 — Magic Kingdom\nRope drop\n### Day 2 — EPCOT\nSoarin");
    expect(parts.blocks).toEqual([
      { title: "Day 1 — Magic Kingdom", body: "Rope drop" },
      { title: "Day 2 — EPCOT", body: "Soarin" },
    ]);
  });

  it("finds reply blocks the same way", () => {
    const parts = splitDraft("### Reply to Amy — dates\nHi Amy,\n### Reply to Ben — deposit\nHi Ben,");
    expect(parts.blocks.map((b) => b.title)).toEqual(["Reply to Amy — dates", "Reply to Ben — deposit"]);
  });

  it("does not take day blocks from the internal notes", () => {
    const parts = splitDraft("Intro\n## For Jillian only\n### Day 1 — not for clients\nx");
    expect(parts.blocks).toEqual([]);
  });
});

describe("splitSubject", () => {
  it("pulls a bold subject line off the top of an email", () => {
    expect(splitSubject("**Subject:** Welcome aboard!\n\nHi Maria,")).toEqual({
      subject: "Welcome aboard!",
      body: "Hi Maria,",
    });
  });

  it("returns no subject when the text doesn't start with one", () => {
    expect(splitSubject("Hi Maria,")).toEqual({ subject: null, body: "Hi Maria," });
  });
});

const HANDOFF = `**Verdict:** Great fit

**Trip hand-off**
- Client last name: Whitfield
- Destination: Walt Disney World
- Dates: Late March 2027 (spring break)
- Who's going: 2 adults, kids 4, 7 and 11
- Priorities: Deluxe resort near Magic Kingdom, character dining
- Summary: First visit; daughter's 7th birthday during the trip.

**Questions for the Blueprint Call:**
1. Exact dates?`;

describe("parseTripHandoff", () => {
  it("reads the hand-off block into trip details", () => {
    expect(parseTripHandoff(HANDOFF)).toEqual({
      lastName: "Whitfield",
      destination: "Walt Disney World",
      dates: "Late March 2027 (spring break)",
      party: "2 adults, kids 4, 7 and 11",
      priorities: "Deluxe resort near Magic Kingdom, character dining",
      summary: "First visit; daughter's 7th birthday during the trip.",
    });
  });

  it("leaves the destination blank when it isn't one of the planner's choices", () => {
    expect(parseTripHandoff(HANDOFF.replace("Walt Disney World", "Disneyland Paris"))?.destination).toBe("");
  });

  it("treats 'unknown' as blank", () => {
    expect(parseTripHandoff(HANDOFF.replace("Late March 2027 (spring break)", "unknown"))?.dates).toBe("");
  });

  it("returns null when there's no hand-off or no last name", () => {
    expect(parseTripHandoff("**Verdict:** Maybe")).toBeNull();
    expect(parseTripHandoff(HANDOFF.replace("Whitfield", "unknown"))).toBeNull();
  });
});
