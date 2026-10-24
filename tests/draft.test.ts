import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { handleDraft, type DraftClient } from "../worker/draft";
import { EventParser, KEEPALIVE, type ServerEvent } from "../shared/sse";
import type { DraftRequest } from "../shared/tools";

const ENV = { ANTHROPIC_API_KEY: "test", APP_PASSWORD: "test" } as Env;

type Script = { events: BetaRawMessageStreamEvent[]; final: Partial<BetaMessage>; silentMs?: number };

function textEvents(...chunks: string[]): BetaRawMessageStreamEvent[] {
  return [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } },
    ...chunks.map((text) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
  ] as unknown as BetaRawMessageStreamEvent[];
}

function fakeClient(...scripts: Script[]) {
  const calls: BetaMessageStreamParams[] = [];
  const client: DraftClient = {
    beta: {
      messages: {
        stream(params) {
          calls.push(structuredClone(params));
          const script = scripts[calls.length - 1];
          return {
            async *[Symbol.asyncIterator]() {
              if (script.silentMs) await new Promise((r) => setTimeout(r, script.silentMs));
              yield* script.events;
            },
            finalMessage: async () => ({ content: [], ...script.final }) as BetaMessage,
          };
        },
      },
    },
  };
  return { client, calls, make: () => client };
}

function post(body: unknown): Request {
  return new Request("https://app.test/api/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function readEvents(res: Response): Promise<{ events: ServerEvent[]; raw: string }> {
  const raw = await res.text();
  return { events: new EventParser().push(raw), raw };
}

const MAIL: DraftRequest = { tool: "magic-mail", fields: { emailType: "Welcome", clientNames: "The Smiths" } };

afterEach(() => {
  vi.useRealTimers();
});

describe("handleDraft validation", () => {
  it("rejects an unknown tool", async () => {
    const res = await handleDraft(post({ tool: "nope", fields: {} }), ENV, fakeClient().make);
    expect(res.status).toBe(400);
  });

  it("rejects a missing required field", async () => {
    const res = await handleDraft(post({ tool: "magic-mail", fields: { emailType: "Welcome" } }), ENV, fakeClient().make);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("Client names");
  });

  it("rejects a body that isn't JSON", async () => {
    const res = await handleDraft(post("not json"), ENV, fakeClient().make);
    expect(res.status).toBe(400);
  });

  it("rejects an over-length field", async () => {
    const res = await handleDraft(
      post({ tool: "magic-mail", fields: { emailType: "Welcome", clientNames: "x".repeat(201) } }),
      ENV,
      fakeClient().make,
    );
    expect(res.status).toBe(400);
  });

  it("blocks a card number without calling Claude", async () => {
    const fake = fakeClient();
    const res = await handleDraft(
      post({ ...MAIL, fields: { ...MAIL.fields, details: "Pay with 4111 1111 1111 1111" } }),
      ENV,
      fake.make,
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toContain("card number");
    expect(fake.calls).toHaveLength(0);
  });

  it("blocks a card number pasted into a refinement", async () => {
    const fake = fakeClient();
    const res = await handleDraft(
      post({ ...MAIL, refinements: [{ draft: "Hi", request: "add card 4111111111111111" }] }),
      ENV,
      fake.make,
    );
    expect(res.status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses more than five refinements", async () => {
    const refinements = Array.from({ length: 6 }, () => ({ draft: "Hi", request: "shorter" }));
    const res = await handleDraft(post({ ...MAIL, refinements }), ENV, fakeClient().make);
    expect(res.status).toBe(413);
  });

  it("refuses a conversation over 60,000 characters", async () => {
    const refinements = [{ draft: "x".repeat(60_001), request: "shorter" }];
    const res = await handleDraft(post({ ...MAIL, refinements }), ENV, fakeClient().make);
    expect(res.status).toBe(413);
  });
});

describe("handleDraft streaming", () => {
  it("forwards text and finishes with done", async () => {
    const fake = fakeClient({ events: textEvents("Hello", " there"), final: { stop_reason: "end_turn" } });
    const res = await handleDraft(post(MAIL), ENV, fake.make);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const { events } = await readEvents(res);
    expect(events).toEqual([
      { event: "text", data: "Hello" },
      { event: "text", data: " there" },
      { event: "done", data: { stopReason: "end_turn", sources: [] } },
    ]);
  });

  it("resumes a paused turn and sends one done", async () => {
    const paused = [{ type: "text", text: "Part one", citations: null }];
    const fake = fakeClient(
      { events: textEvents("Part one"), final: { stop_reason: "pause_turn", content: paused as BetaMessage["content"] } },
      { events: textEvents(" and two"), final: { stop_reason: "end_turn" } },
    );
    const { events } = await readEvents(await handleDraft(post(MAIL), ENV, fake.make));
    expect(fake.calls).toHaveLength(2);
    expect(fake.calls[1].messages.at(-1)).toEqual({ role: "assistant", content: paused });
    expect(events.filter((e) => e.event === "done")).toHaveLength(1);
  });

  it("reports a refusal in done", async () => {
    const fake = fakeClient({ events: [], final: { stop_reason: "refusal" } });
    const { events } = await readEvents(await handleDraft(post(MAIL), ENV, fake.make));
    expect(events.at(-1)).toEqual({ event: "done", data: { stopReason: "refusal", sources: [] } });
  });

  it("collects cited sources from the final message", async () => {
    const content = [
      {
        type: "text",
        text: "Open late",
        citations: [
          { type: "web_search_result_location", url: "https://a.test", title: "Park hours", cited_text: "", encrypted_index: "" },
          { type: "web_search_result_location", url: "https://a.test", title: "Park hours", cited_text: "", encrypted_index: "" },
        ],
      },
    ];
    const fake = fakeClient({ events: textEvents("Open late"), final: { stop_reason: "end_turn", content: content as BetaMessage["content"] } });
    const { events } = await readEvents(await handleDraft(post(MAIL), ENV, fake.make));
    expect(events.at(-1)).toEqual({
      event: "done",
      data: { stopReason: "end_turn", sources: [{ title: "Park hours", url: "https://a.test" }] },
    });
  });

  it("says when it starts searching and when it starts writing", async () => {
    const events = [
      { type: "content_block_start", index: 0, content_block: { type: "server_tool_use", id: "s1", name: "web_search", input: {} } },
      ...textEvents("Found it"),
    ] as unknown as BetaRawMessageStreamEvent[];
    const fake = fakeClient({ events, final: { stop_reason: "end_turn" } });
    const out = await readEvents(await handleDraft(post(MAIL), ENV, fake.make));
    expect(out.events.slice(0, 3)).toEqual([
      { event: "status", data: { phase: "searching" } },
      { event: "status", data: { phase: "writing" } },
      { event: "text", data: "Found it" },
    ]);
  });

  it("sends an error event when the call fails", async () => {
    const client: DraftClient = {
      beta: {
        messages: {
          stream() {
            return {
              async *[Symbol.asyncIterator]() {
                throw new Error("boom");
              },
              finalMessage: async () => ({}) as BetaMessage,
            };
          },
        },
      },
    };
    const { events } = await readEvents(await handleDraft(post(MAIL), ENV, () => client));
    expect(events).toEqual([{ event: "error", data: { message: "Something went wrong — try again." } }]);
  });

  it("keeps the connection alive during long silences", async () => {
    vi.useFakeTimers();
    const fake = fakeClient({ events: textEvents("Hi"), final: { stop_reason: "end_turn" }, silentMs: 31_000 });
    const res = await handleDraft(post(MAIL), ENV, fake.make, 15_000);
    const body = readEvents(res);
    await vi.advanceTimersByTimeAsync(31_000);
    const { raw } = await body;
    expect(raw.split(KEEPALIVE).length - 1).toBeGreaterThanOrEqual(2);
  });
});

describe("handleDraft diagnostics", () => {
  it("logs the kind of failure but never the request text", async () => {
    const logged: unknown[][] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args) => void logged.push(args));
    const client: DraftClient = {
      beta: {
        messages: {
          stream() {
            return {
              async *[Symbol.asyncIterator]() {
                throw new TypeError("details about The Smiths");
              },
              finalMessage: async () => ({}) as BetaMessage,
            };
          },
        },
      },
    };
    await readEvents(await handleDraft(post(MAIL), ENV, () => client));
    spy.mockRestore();
    const text = JSON.stringify(logged);
    expect(text).toContain("TypeError");
    expect(text).not.toContain("Smiths");
  });
});

describe("handleDraft re-checks only what Jillian typed", () => {
  it("does not block a refine because of wording in Claude's own draft", async () => {
    const fake = fakeClient({ events: [], final: { stop_reason: "end_turn" } });
    const draft = "Bring passports for everyone. Passport 567891234 style numbers go to the cruise line.";
    const res = await handleDraft(post({ ...MAIL, refinements: [{ draft, request: "warmer" }] }), ENV, fake.make);
    expect(res.status).toBe(200);
  });
});

describe("handleDraft request to Claude", () => {
  it("uses Opus 5.5 at high effort with web search for trip plans", async () => {
    const fake = fakeClient({ events: [], final: { stop_reason: "end_turn" } });
    const trip = { tool: "adventure-planner", fields: { destination: "Walt Disney World", dates: "June", party: "2 adults" } };
    await readEvents(await handleDraft(post(trip), ENV, fake.make));
    const params = fake.calls[0];
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.max_tokens).toBe(64_000);
    expect(params.output_config?.effort).toBe("high");
    expect(params.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
    expect(params.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(params.fallbacks).toBe("default");
  });

  it("uses medium effort and no tools for client emails", async () => {
    const fake = fakeClient({ events: [], final: { stop_reason: "end_turn" } });
    await readEvents(await handleDraft(post(MAIL), ENV, fake.make));
    expect(fake.calls[0].output_config?.effort).toBe("medium");
    expect(fake.calls[0].tools).toBeUndefined();
  });

  it("masks client emails before they reach Claude", async () => {
    const fake = fakeClient({ events: [], final: { stop_reason: "end_turn" } });
    await readEvents(
      await handleDraft(post({ ...MAIL, fields: { ...MAIL.fields, details: "Write to amy@example.com" } }), ENV, fake.make),
    );
    expect(JSON.stringify(fake.calls[0].messages)).toContain("[email]");
    expect(JSON.stringify(fake.calls[0].messages)).not.toContain("amy@example.com");
  });

  it("sends refinements as alternating assistant and user turns", async () => {
    const fake = fakeClient({ events: [], final: { stop_reason: "end_turn" } });
    await readEvents(
      await handleDraft(post({ ...MAIL, refinements: [{ draft: "Draft one", request: "Shorter" }] }), ENV, fake.make),
    );
    expect(fake.calls[0].messages.slice(1)).toEqual([
      { role: "assistant", content: "Draft one" },
      { role: "user", content: "Shorter" },
    ]);
  });
});
