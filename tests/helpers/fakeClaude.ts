// A scripted stand-in for the Anthropic client's beta.messages.stream.
import type {
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { ClaudeClient } from "../../worker/claude";

export type Script = {
  events?: BetaRawMessageStreamEvent[];
  final?: Partial<BetaMessage>;
  /** Throw this from the stream instead of finishing. */
  error?: Error;
};

export function textEvents(...chunks: string[]): BetaRawMessageStreamEvent[] {
  return [
    { type: "content_block_start", index: 0, content_block: { type: "text", text: "", citations: null } },
    ...chunks.map((text) => ({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })),
  ] as unknown as BetaRawMessageStreamEvent[];
}

export function fakeClaude(...scripts: Script[]) {
  const calls: BetaMessageStreamParams[] = [];
  const client: ClaudeClient = {
    beta: {
      messages: {
        stream(params) {
          calls.push(structuredClone(params));
          const script = scripts[Math.min(calls.length, scripts.length) - 1] ?? {};
          return {
            async *[Symbol.asyncIterator]() {
              yield* script.events ?? [];
              if (script.error) throw script.error;
            },
            finalMessage: async () => ({ content: [], stop_reason: "end_turn", ...script.final }) as BetaMessage,
          };
        },
      },
    },
  };
  return { client, calls, make: () => client };
}
