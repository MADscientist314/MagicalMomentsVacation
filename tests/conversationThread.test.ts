import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConversationThread } from "../src/components/ConversationThread";
import { initialChatState, type ChatState } from "../src/lib/chatState";

const PLAN = "Here's the plan.\n\n### Day 1 — Arrival\nSwim\n\n### Day 2 — Magic Kingdom\nRope drop";
const OPTIONS = "Two ideas:\n\n### Option 1 — Pop Century\nValue\n\n### Option 2 — Polynesian\nDeluxe";

const render = (turns: ChatState["turns"]) =>
  renderToStaticMarkup(createElement(ConversationThread, { state: { ...initialChatState, turns }, mode: "trip" }));

describe("ConversationThread (trip)", () => {
  it("keeps the day-by-day plan as the current plan when a later reply has other ### headings", () => {
    const html = render([
      { role: "user", content: "Plan it" },
      { role: "assistant", content: PLAN },
      { role: "user", content: "Suggest options" },
      { role: "assistant", content: OPTIONS },
    ]);
    expect(html.match(/Current plan/g)).toHaveLength(1);
    expect(html).not.toContain("Earlier plan");
    expect(html.indexOf("Current plan")).toBeLessThan(html.indexOf("Option 1"));
    expect(html.match(/Copy day/g)).toHaveLength(2);
  });

  it("copes with two blocks that have the same title", () => {
    const html = render([
      { role: "user", content: "Plan it" },
      { role: "assistant", content: "### Day 1 — Park day\nA\n\n### Day 1 — Park day\nB" },
    ]);
    expect(html.match(/Copy day/g)).toHaveLength(2);
  });
});

describe("her messages", () => {
  it("shows an attached file by name, with its text folded away", () => {
    const content = "Make a proposal from this\n\n[Attached: Draft itinerary.pdf (2 pages)]\nDay 1 secret text\n[End of Draft itinerary.pdf]";
    const html = render([{ role: "user", content }]);
    expect(html).toContain("Make a proposal from this");
    expect(html).toContain("📎 Draft itinerary.pdf (2 pages)");
    expect(html).toContain("Show what was attached");
    expect(html).not.toContain("Day 1 secret text");
  });

  it("folds a long paste after its start", () => {
    const html = render([{ role: "user", content: `Start ${"x".repeat(2_000)} END` }]);
    expect(html).toContain("Start");
    expect(html).toContain("Show all");
    expect(html).not.toContain("END");
  });
});
