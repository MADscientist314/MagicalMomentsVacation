import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DraftPanel } from "../src/components/DraftPanel";
import { TOOLS } from "../shared/tools";

const props = {
  tool: TOOLS["adventure-planner"],
  sources: [],
  stopReason: null,
  error: null,
  receiving: true,
  onRefine: () => {},
  onStartOver: () => {},
};

describe("DraftPanel", () => {
  it("offers Start over while a draft is still being written", () => {
    const html = renderToStaticMarkup(createElement(DraftPanel, { ...props, phase: "writing", draft: "### Day 1 — Arrival\nRest" }));
    expect(html).toContain("Start over");
  });

  it("doesn't call another tool's draft with ### headings a trip plan", () => {
    const html = renderToStaticMarkup(
      createElement(DraftPanel, { ...props, tool: TOOLS["magic-mail"], phase: "done", receiving: false, draft: "Hi!\n\n### What to pack\nSunscreen" }),
    );
    expect(html).not.toContain("Trip plan");
    expect(html).not.toContain("Copy all days");
  });

  it("offers Start over while waiting for the first words", () => {
    const html = renderToStaticMarkup(createElement(DraftPanel, { ...props, phase: "waiting", draft: "", receiving: false }));
    expect(html).toContain("Start over");
  });
});
