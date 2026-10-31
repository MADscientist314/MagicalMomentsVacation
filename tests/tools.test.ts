import { describe, expect, it } from "vitest";
import { HOME_TOOLS, isToolId, TOOLS } from "../shared/tools";

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

describe("model per tool", () => {
  it("uses Haiku for emails and inquiries, and Opus for posts and trip plans", () => {
    expect(Object.fromEntries(Object.values(TOOLS).map((t) => [t.id, t.model]))).toEqual({
      "magic-mail": "claude-haiku-5-5",
      "welcome-center": "claude-haiku-5-5",
      "inbox-helper": "claude-haiku-5-5",
      "spread-the-magic": "claude-opus-5-5",
      "adventure-planner": "claude-opus-5-5",
    });
  });
});

describe("HOME_TOOLS", () => {
  it("shows Inbox Helper in place of Magic Mail, in the order Jillian works", () => {
    expect(HOME_TOOLS).toEqual(["welcome-center", "inbox-helper", "adventure-planner", "spread-the-magic"]);
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
    expect(tool.fields.map((f) => [f.id, f.required ?? false, f.maxLength])).toEqual([
      ["need", false, 40],
      ["emails", true, 20000],
    ]);
  });

  it("offers one-click starts for the emails Magic Mail used to write", () => {
    const need = TOOLS["inbox-helper"].fields[0];
    expect(need.kind).toBe("choice");
    expect(need.options).toEqual([
      "Reply to these emails",
      "New client welcome",
      "Check in (hasn't booked)",
      "Pre-trip reminder",
      "Itinerary and quote",
      "Payment reminder",
      "Welcome home",
    ]);
  });
});
