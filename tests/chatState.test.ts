import { describe, expect, it } from "vitest";
import { chatReducer, initialChatState, messagesForApi, type ChatState } from "../src/lib/chatState";

const sent = (text = "What's new at EPCOT?") => chatReducer(initialChatState, { type: "send", text, notice: null });

describe("chatReducer", () => {
  it("adds Jillian's message and then Claude's streamed reply", () => {
    let s: ChatState = sent();
    expect(s.phase).toBe("waiting");
    s = chatReducer(s, { type: "text", text: "Lots " });
    s = chatReducer(s, { type: "text", text: "of fun!" });
    s = chatReducer(s, { type: "done", stopReason: "end_turn", sources: [{ title: "Disney", url: "https://d.test" }] });
    expect(s.turns).toEqual([
      { role: "user", content: "What's new at EPCOT?" },
      { role: "assistant", content: "Lots of fun!", sources: [{ title: "Disney", url: "https://d.test" }] },
    ]);
    expect(s.phase).toBe("idle");
  });

  it("gives the message back to the box when it fails before any reply", () => {
    const s = chatReducer(sent("Help with the Smiths"), { type: "error", message: "It's busy right now — try again in a minute." });
    expect(s.turns).toEqual([]);
    expect(s.restore).toBe("Help with the Smiths");
    expect(s.error).toContain("busy");
    expect(s.phase).toBe("idle");
  });

  it("takes back a partial reply when it fails midway, since nothing was saved", () => {
    const saved: ChatState = { ...initialChatState, turns: [{ role: "user", content: "Plan it" }, { role: "assistant", content: "Day 1…" }] };
    let s = chatReducer(saved, { type: "send", text: "Swap days 2 and 3", notice: null });
    s = chatReducer(s, { type: "text", text: "Half an ans" });
    s = chatReducer(s, { type: "error", message: "The reply was cut off — try again." });
    expect(s.turns).toEqual(saved.turns);
    expect(s.restore).toBe("Swap days 2 and 3");
    expect(s.error).toBe("The reply was cut off — try again.");
    expect(s.phase).toBe("idle");
  });

  it("doesn't hand back a request that wasn't typed (Plan it)", () => {
    let s = chatReducer(initialChatState, { type: "send", text: "Plan this trip, please.", notice: null, restorable: false });
    s = chatReducer(s, { type: "text", text: "Day 1" });
    s = chatReducer(s, { type: "error", message: "The reply was cut off — try again." });
    expect(s.turns).toEqual([]);
    expect(s.restore).toBeNull();
  });

  it("explains a refusal that came with no reply", () => {
    const s = chatReducer(sent(), { type: "done", stopReason: "refusal", sources: [] });
    expect(s.turns).toEqual([]);
    expect(s.error).toBe("I can't help with that one — try rewording.");
  });

  it("takes back a refused reply even if some text arrived", () => {
    let s = chatReducer(sent("Hmm"), { type: "text", text: "I" });
    s = chatReducer(s, { type: "done", stopReason: "refusal", sources: [] });
    expect(s.turns).toEqual([]);
    expect(s.restore).toBe("Hmm");
    expect(s.error).toBe("I can't help with that one — try rewording.");
  });

  it("starts fresh on reset", () => {
    expect(chatReducer(sent(), { type: "reset" })).toEqual(initialChatState);
  });
});

describe("messagesForApi", () => {
  it("sends only roles and text", () => {
    expect(
      messagesForApi([
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello!", sources: [{ title: "x", url: "https://x.test" }] },
      ]),
    ).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
    ]);
  });
});
