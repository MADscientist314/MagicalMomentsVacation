import { describe, expect, it } from "vitest";
import { splitDraft } from "../shared/sections";

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
    expect(parts.days).toEqual([
      { title: "Day 1 — Magic Kingdom", body: "Rope drop" },
      { title: "Day 2 — EPCOT", body: "Soarin" },
    ]);
  });

  it("does not take day blocks from the internal notes", () => {
    const parts = splitDraft("Intro\n## For Jillian only\n### Day 1 — not for clients\nx");
    expect(parts.days).toEqual([]);
  });
});
