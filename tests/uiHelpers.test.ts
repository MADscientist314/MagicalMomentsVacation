import { describe, expect, it } from "vitest";
import { parseRoute } from "../src/lib/route";
import { emptyLike, humanize, toPrice } from "../src/lib/editorHelpers";
import { downloadName, missingPrices } from "../src/lib/deliverableFiles";
import { chatReducer, initialChatState } from "../src/lib/chatState";
import type { Estimate, Proposal } from "../shared/deliverables";

describe("parseRoute", () => {
  it("maps hashes to pages", () => {
    expect(parseRoute("")).toEqual({ page: "home" });
    expect(parseRoute("#/")).toEqual({ page: "home" });
    expect(parseRoute("#/trips")).toEqual({ page: "trips" });
    expect(parseRoute("#/trips/new")).toEqual({ page: "new-trip" });
    expect(parseRoute("#/trips/abc-123")).toEqual({ page: "trip", id: "abc-123" });
    expect(parseRoute("#/chat")).toEqual({ page: "chat" });
    expect(parseRoute("#/chat/xyz")).toEqual({ page: "chat", id: "xyz" });
    expect(parseRoute("#/magic-mail")).toEqual({ page: "tool", tool: "magic-mail" });
    expect(parseRoute("#/adventure-planner")).toEqual({ page: "trips" });
    expect(parseRoute("#/images")).toEqual({ page: "images" });
    expect(parseRoute("#/nope")).toEqual({ page: "home" });
  });
});

describe("editor helpers", () => {
  it("turns field keys into friendly labels", () => {
    expect(humanize("unitPrice")).toBe("Price each");
    expect(humanize("verifyNotes")).toBe("Notes for you (not shown to the client)");
    expect(humanize("bestFor")).toBe("Best for");
    expect(humanize("somethingNew")).toBe("Something new");
  });

  it("makes a blank copy for a new row", () => {
    expect(emptyLike({ label: "Tickets", qty: 4, unit: "tickets", unitPrice: 600, note: "x" })).toEqual({ label: "", qty: 1, unit: "", unitPrice: null, note: "" });
    expect(humanize("qty")).toBe("How many");
    expect(humanize("unit")).toBe("Of what (nights, tickets…)");
    expect(emptyLike({ time: "9 AM", text: "Rope drop" })).toEqual({ time: null, text: "" });
    expect(emptyLike({ title: "Day 1", items: [], photo: "abc" })).toEqual({ title: "", items: [] });
  });

  it("reads a typed price, leaving blanks as missing", () => {
    expect(toPrice("$2,140.50")).toBe(2140.5);
    expect(toPrice("")).toBeNull();
    expect(toPrice("abc")).toBeNull();
  });
});

describe("deliverable files", () => {
  it("names downloads after the family and document", () => {
    expect(downloadName("Rivera family", "itinerary", 2)).toBe("Rivera-family-itinerary-v2.html");
  });

  it("lists what still needs a price", () => {
    const estimate: Estimate = {
      title: "x",
      lineItems: [
        { label: "Resort", qty: 1, unitPrice: 100, note: "" },
        { label: "Insurance", qty: 1, unitPrice: null, note: "" },
      ],
      notes: [],
      verifyNotes: [],
    };
    expect(missingPrices("estimate", estimate)).toEqual(["Insurance"]);
    const proposal = {
      options: [
        { name: "Pop", price: { amount: null } },
        { name: "Poly", price: { amount: 5 } },
      ],
    } as unknown as Proposal;
    expect(missingPrices("proposal", proposal)).toEqual(["Pop"]);
    expect(missingPrices("itinerary", { days: [] } as never)).toEqual([]);
  });
});

describe("chatReducer load", () => {
  it("replaces the thread with what the server saved", () => {
    const s = chatReducer(
      { ...initialChatState, error: "old" },
      { type: "load", turns: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }] },
    );
    expect(s.turns).toHaveLength(2);
    expect(s.error).toBeNull();
    expect(s.phase).toBe("idle");
  });
});
