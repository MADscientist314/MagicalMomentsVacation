import { describe, expect, it } from "vitest";
import { isToolId, TOOLS } from "../shared/tools";

describe("TOOLS", () => {
  it("gives every tool at least one required field", () => {
    for (const tool of Object.values(TOOLS)) {
      expect(tool.fields.some((f) => f.required), tool.id).toBe(true);
    }
  });

  it("keys each tool by its own id", () => {
    for (const [key, tool] of Object.entries(TOOLS)) expect(tool.id).toBe(key);
  });

  it("uses web search only for marketing and trip planning", () => {
    const searching = Object.values(TOOLS).filter((t) => t.webSearch).map((t) => t.id);
    expect(searching.sort()).toEqual(["adventure-planner", "spread-the-magic"]);
  });
});

describe("Adventure Planner destinations", () => {
  it("offers every kind of trip Jillian books, plus Other", () => {
    const destination = TOOLS["adventure-planner"].fields.find((f) => f.id === "destination");
    expect(destination?.options).toEqual([
      "Walt Disney World",
      "Disneyland",
      "Universal Orlando",
      "Disney Cruise Line",
      "Royal Caribbean cruise",
      "Other cruise",
      "All-inclusive resort",
      "Adventures by Disney",
      "Other",
    ]);
  });
});

describe("isToolId", () => {
  it("accepts known ids and rejects others", () => {
    expect(isToolId("magic-mail")).toBe(true);
    expect(isToolId("nope")).toBe(false);
    expect(isToolId(42)).toBe(false);
  });
});

describe("Inbox Helper", () => {
  it("takes pasted emails and puts the priorities first", () => {
    const tool = TOOLS["inbox-helper"];
    expect(tool.name).toBe("Inbox Helper");
    expect(tool.webSearch).toBe(false);
    expect(tool.notesFirst).toBe(true);
    expect(tool.fields.map((f) => [f.id, f.required, f.maxLength])).toEqual([["emails", true, 20000]]);
  });
});
