import { describe, expect, it } from "vitest";
import type { BetaMessage, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { handleChat } from "../worker/chat";
import type { ClaudeClient } from "../worker/claude";
import { BRAINS } from "../worker/brains";
import { EventParser } from "../shared/sse";

const ENV = { ANTHROPIC_API_KEY: "test", APP_PASSWORD: "test" } as Env;

function fakeClient() {
  const calls: BetaMessageStreamParams[] = [];
  const client: ClaudeClient = {
    beta: {
      messages: {
        stream(params) {
          calls.push(structuredClone(params));
          return {
            async *[Symbol.asyncIterator]() {
              yield { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Happy to help!" } } as never;
            },
            finalMessage: async () => ({ content: [], stop_reason: "end_turn" }) as unknown as BetaMessage,
          };
        },
      },
    },
  };
  return { calls, make: () => client };
}

const post = (body: unknown) =>
  new Request("https://app.test/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

const turns = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `message ${i}` }));

describe("handleChat", () => {
  it("streams Claude's reply", async () => {
    const fake = fakeClient();
    const res = await handleChat(post({ messages: [{ role: "user", content: "What's new at EPCOT?" }] }), ENV, fake.make);
    const events = new EventParser().push(await res.text());
    expect(events[0]).toEqual({ event: "text", data: "Happy to help!" });
    expect(events.at(-1)?.event).toBe("done");
  });

  it("sends the whole conversation with Jillian's chat instructions and her reference pack", async () => {
    const fake = fakeClient();
    await (await handleChat(post({ messages: turns(3) }), ENV, fake.make)).text();
    const params = fake.calls[0];
    expect(params.messages).toEqual(turns(3));
    const system = JSON.stringify(params.system);
    expect(system).toContain("Jillian's voice");
    expect(system).toContain("Fit rules for new inquiries");
    expect(system).toContain("Booking windows cheat sheet");
    expect(system).toContain(JSON.stringify(BRAINS["chat"].trim()).slice(1, 60));
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.output_config?.effort).toBe("medium");
    expect(params.tools).toEqual([{ type: "web_search_20260209", name: "web_search", max_uses: 5 }]);
  });

  it("masks contact details in what Jillian says", async () => {
    const fake = fakeClient();
    await (await handleChat(post({ messages: [{ role: "user", content: "Email amy@example.com about it" }] }), ENV, fake.make)).text();
    expect(JSON.stringify(fake.calls[0].messages)).toContain("[email]");
  });

  it("blocks a card number before calling Claude", async () => {
    const fake = fakeClient();
    const res = await handleChat(post({ messages: [{ role: "user", content: "Her card is 4111 1111 1111 1111" }] }), ENV, fake.make);
    expect(res.status).toBe(400);
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a conversation that doesn't end with Jillian speaking", async () => {
    const res = await handleChat(post({ messages: turns(2) }), ENV, fakeClient().make);
    expect(res.status).toBe(400);
  });

  it("rejects turns that don't alternate", async () => {
    const res = await handleChat(
      post({ messages: [{ role: "user", content: "a" }, { role: "user", content: "b" }] }),
      ENV,
      fakeClient().make,
    );
    expect(res.status).toBe(400);
  });

  it("asks for a new chat once the conversation is very long", async () => {
    expect((await handleChat(post({ messages: turns(41) }), ENV, fakeClient().make)).status).toBe(413);
    const long = [{ role: "user", content: "x".repeat(4_000) }, ...turns(30).slice(1), { role: "user", content: "and?" }];
    const big = long.map((m, i) => (m.role === "assistant" && i < 20 ? { ...m, content: "y".repeat(6_000) } : m));
    expect((await handleChat(post({ messages: big }), ENV, fakeClient().make)).status).toBe(413);
  });
});
