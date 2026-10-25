import { afterEach, describe, expect, it, vi } from "vitest";
import { streamDraft, streamPost } from "../src/lib/streamDraft";
import { encodeEvent } from "../shared/sse";
import type { DraftRequest } from "../shared/tools";

const BODY: DraftRequest = { tool: "magic-mail", fields: { emailType: "Welcome", clientNames: "The Smiths" } };

function handlers() {
  return { text: vi.fn(), status: vi.fn(), done: vi.fn(), error: vi.fn() };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("streamDraft", () => {
  it("passes text and done events through", async () => {
    const sse =
      encodeEvent({ event: "text", data: "Hi" }) +
      encodeEvent({ event: "done", data: { stopReason: "end_turn", sources: [] } });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sse, { headers: { "content-type": "text/event-stream" } })));
    const on = handlers();
    await streamDraft(BODY, on, new AbortController().signal);
    expect(on.text).toHaveBeenCalledWith("Hi");
    expect(on.done).toHaveBeenCalledWith({ stopReason: "end_turn", sources: [] });
    expect(on.error).not.toHaveBeenCalled();
  });

  it("reports the server's error message on a 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "x" }, { status: 400 })));
    const on = handlers();
    await streamDraft(BODY, on, new AbortController().signal);
    expect(on.error).toHaveBeenCalledWith("x");
  });

  it("asks to sign in again when the login has expired", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { headers: { "content-type": "text/html" } })));
    const on = handlers();
    await streamDraft(BODY, on, new AbortController().signal);
    expect(on.error).toHaveBeenCalledWith("Your sign-in expired — reload the page to sign in again.");
  });

  it("reports a cut-off reply when the stream ends without done or error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(encodeEvent({ event: "text", data: "Hi" }), { headers: { "content-type": "text/event-stream" } })),
    );
    const on = handlers();
    await streamDraft(BODY, on, new AbortController().signal);
    expect(on.text).toHaveBeenCalledWith("Hi");
    expect(on.done).not.toHaveBeenCalled();
    expect(on.error).toHaveBeenCalledWith("The reply was cut off — try again.");
  });

  it("stops quietly when aborted mid-stream", async () => {
    const abort = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(encodeEvent({ event: "text", data: "Hi" })));
            init.signal!.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")));
          },
        });
        return new Response(body, { headers: { "content-type": "text/event-stream" } });
      }),
    );
    const on = handlers();
    on.text.mockImplementation(() => abort.abort());
    await streamDraft(BODY, on, abort.signal);
    expect(on.text).toHaveBeenCalledWith("Hi");
    expect(on.error).not.toHaveBeenCalled();
    expect(on.done).not.toHaveBeenCalled();
  });
});

describe("streamPost", () => {
  it("posts to any streaming endpoint", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(encodeEvent({ event: "done", data: { stopReason: "end_turn", sources: [] } }), { headers: { "content-type": "text/event-stream" } }));
    vi.stubGlobal("fetch", fetchMock);
    const on = handlers();
    await streamPost("/api/conversations/abc/messages", { content: "Hi" }, on, new AbortController().signal);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/conversations/abc/messages");
    expect(on.done).toHaveBeenCalled();
  });
});
