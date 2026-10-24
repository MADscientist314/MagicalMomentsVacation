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

  it("keeps a partial reply when it fails midway", () => {
    let s = chatReducer(sent(), { type: "text", text: "Half an ans" });
    s = chatReducer(s, { type: "error", message: "Couldn't reach the assistant — check the internet connection." });
    expect(s.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
    expect(s.restore).toBeNull();
  });

  it("explains a refusal that came with no reply", () => {
    const s = chatReducer(sent(), { type: "done", stopReason: "refusal", sources: [] });
    expect(s.turns).toEqual([]);
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
