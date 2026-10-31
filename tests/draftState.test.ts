import { describe, expect, it } from "vitest";
import { draftReducer, initialDraftState, type DraftState } from "../src/lib/draftState";
import type { DraftRequest } from "../shared/tools";

const FIRST: DraftRequest = { tool: "magic-mail", fields: { emailType: "Welcome", clientNames: "The Smiths" } };
const REFINE: DraftRequest = { ...FIRST, refinements: [{ draft: "Hi Smiths", request: "shorter" }] };

function finishedDraft(): DraftState {
  let s = draftReducer(initialDraftState, { type: "start", body: FIRST });
  s = draftReducer(s, { type: "text", text: "Hi Smiths" });
  return draftReducer(s, { type: "done", stopReason: "end_turn", sources: [] });
}

describe("draftReducer load", () => {
  it("shows a saved draft as finished and ready to refine", () => {
    const s = draftReducer(finishedDraft(), {
      type: "load",
      draft: "Saved reply",
      sources: [{ title: "Disney", url: "https://d.test" }],
      committed: REFINE,
    });
    expect(s).toMatchObject({ phase: "done", draft: "Saved reply", receiving: true, committed: REFINE, error: null, pending: null });
    expect(s.sources).toHaveLength(1);
  });
});

describe("draftReducer", () => {
  it("keeps the last good draft when a refine fails before any text arrives", () => {
    let s = draftReducer(finishedDraft(), { type: "start", body: REFINE });
    s = draftReducer(s, { type: "error", message: "This conversation has gotten long — start over to keep going." });
    expect(s.draft).toBe("Hi Smiths");
    expect(s.committed).toEqual(FIRST);
    expect(s.error).toContain("start over");
    expect(s.phase).toBe("done");
  });

  it("replaces the old draft once the refined text starts arriving", () => {
    let s = draftReducer(finishedDraft(), { type: "start", body: REFINE });
    expect(s.draft).toBe("Hi Smiths");
    s = draftReducer(s, { type: "text", text: "Hi!" });
    expect(s.draft).toBe("Hi!");
    expect(s.committed).toEqual(REFINE);
  });

  it("clears everything on reset", () => {
    expect(draftReducer(finishedDraft(), { type: "reset" })).toEqual(initialDraftState);
  });
});
