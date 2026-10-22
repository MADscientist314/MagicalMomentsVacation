import { describe, expect, it } from "vitest";
import { encodeEvent, EventParser, KEEPALIVE, type ServerEvent } from "../shared/sse";

const ALL: ServerEvent[] = [
  { event: "text", data: "Hello, \"world\"\nline two" },
  { event: "status", data: { phase: "searching" } },
  { event: "done", data: { stopReason: "end_turn", sources: [{ title: "Disney", url: "https://example.com" }] } },
  { event: "error", data: { message: "It's busy right now" } },
];

describe("SSE codec", () => {
  it("round-trips every event variant", () => {
    const parser = new EventParser();
    expect(parser.push(ALL.map(encodeEvent).join(""))).toEqual(ALL);
  });

  it("returns a frame split across two pushes exactly once", () => {
    const parser = new EventParser();
    const frame = encodeEvent(ALL[0]);
    const cut = Math.floor(frame.length / 2);
    expect(parser.push(frame.slice(0, cut))).toEqual([]);
    expect(parser.push(frame.slice(cut))).toEqual([ALL[0]]);
  });

  it("ignores keepalive comments", () => {
    const parser = new EventParser();
    expect(parser.push(KEEPALIVE + encodeEvent(ALL[1]) + KEEPALIVE)).toEqual([ALL[1]]);
  });
});
