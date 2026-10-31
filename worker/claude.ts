// Shared plumbing for every Claude call: the client, the request defaults, and
// re-streaming Claude's reply to the browser as our small SSE protocol.
import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { encodeEvent, KEEPALIVE, type ServerEvent } from "../shared/sse";

export const MODEL = "claude-opus-5-5";
/** Up to 20 searches per reply: trips check parks, dining and refurbishments; chat and posts check what's new. */
export const WEB_SEARCH = { type: "web_search_20260209", name: "web_search", max_uses: 20 } as const;
const MAX_PAUSE_RESUMES = 3;

/** The slice of the Anthropic client we use (injectable for tests). */
export interface ClaudeClient {
  beta: {
    messages: {
      stream(
        params: BetaMessageStreamParams,
        options?: { signal?: AbortSignal },
      ): AsyncIterable<BetaRawMessageStreamEvent> & { finalMessage(): Promise<BetaMessage> };
    };
  };
}

export const defaultClient = (env: Env): ClaudeClient => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

/** Request settings every call shares: model, room to write, refusal fallback. */
export function baseParams(
  rest: Pick<BetaMessageStreamParams, "system" | "messages" | "output_config" | "tools">,
): BetaMessageStreamParams {
  return {
    model: MODEL,
    max_tokens: 64_000,
    ...rest,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };
}

function collectSources(content: BetaContentBlock[], into: Map<string, { title: string; url: string }>): void {
  for (const block of content) {
    if (block.type === "text") {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") into.set(c.url, { title: c.title ?? c.url, url: c.url });
      }
    }
  }
  if (into.size) return;
  for (const block of content) {
    if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
      for (const r of block.content) into.set(r.url, { title: r.title, url: r.url });
    }
  }
}

/** Error class and HTTP status only — never the message, which can echo client details. */
function describeError(err: unknown): string {
  if (err instanceof Anthropic.APIError) return `${err.name} ${err.status ?? ""}`.trim();
  return err instanceof Error ? err.name : typeof err;
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The assistant isn't connected yet (API key).";
  if (err instanceof Anthropic.RateLimitError) return "It's busy right now — try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the assistant — check the internet connection.";
  return "Something went wrong — try again.";
}

/** An error whose message is safe and helpful to show Jillian as-is. */
export class UserFacingError extends Error {}

export interface StreamHooks {
  /** Send Claude's text to the browser as it arrives (default true; off for JSON deliverables). */
  forwardText?: boolean;
  /**
   * Runs before `done` is sent (e.g. to save the reply) and may return extra events to send first.
   * If it throws, an error is sent instead of `done`.
   */
  beforeDone?(result: { text: string; sources: Source[]; stopReason: string }): Promise<ServerEvent[] | void>;
  /** Runs once the stream has ended, however it ended (e.g. to release a lock). */
  finally?(): Promise<void>;
  /** Keeps the Worker alive until the stream's work, including the hooks, has finished. */
  waitUntil?(work: Promise<unknown>): void;
}

type Source = { title: string; url: string };

/** Calls Claude and streams the reply to the browser; `label` only tags error logs. */
export function streamClaude(
  params: BetaMessageStreamParams,
  env: Env,
  makeClient: (env: Env) => ClaudeClient,
  keepaliveMs: number,
  label: string,
  hooks: StreamHooks = {},
): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  const abort = new AbortController();
  // A failed write means the browser went away: stop the Claude call too.
  const write = (s: string) =>
    writer.write(encoder.encode(s)).catch((err) => {
      abort.abort();
      throw err;
    });
  const send = (e: ServerEvent) => write(encodeEvent(e));

  const run = async () => {
    const keepalive = setInterval(() => write(KEEPALIVE).catch(() => {}), keepaliveMs);
    try {
      const client = makeClient(env);
      const sources = new Map<string, Source>();
      let text = "";
      let searching = false;
      let stopReason = "end_turn";
      for (let turn = 0; ; turn++) {
        const stream = client.beta.messages.stream(params, { signal: abort.signal });
        for await (const event of stream) {
          if (event.type === "content_block_start") {
            if (event.content_block.type === "server_tool_use" && !searching) {
              searching = true;
              await send({ event: "status", data: { phase: "searching" } });
            } else if (event.content_block.type === "text" && searching) {
              searching = false;
              await send({ event: "status", data: { phase: "writing" } });
            }
          } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            text += event.delta.text;
            if (hooks.forwardText !== false) await send({ event: "text", data: event.delta.text });
          }
        }
        const final = await stream.finalMessage();
        collectSources(final.content, sources);
        stopReason = final.stop_reason ?? "end_turn";
        if (stopReason === "pause_turn" && turn < MAX_PAUSE_RESUMES) {
          params.messages.push({ role: "assistant", content: final.content });
          continue;
        }
        break;
      }
      let extra: ServerEvent[] = [];
      try {
        extra = (await hooks.beforeDone?.({ text, sources: [...sources.values()], stopReason })) ?? [];
      } catch (err) {
        const message = err instanceof UserFacingError ? err.message : "Couldn't save that reply — try again.";
        if (!(err instanceof UserFacingError)) console.error(`${label} save failed:`, describeError(err));
        await send({ event: "error", data: { message } }).catch(() => {});
        return;
      }
      for (const e of extra) await send(e);
      await send({ event: "done", data: { stopReason, sources: [...sources.values()] } });
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error(`${label} failed:`, describeError(err));
        await send({ event: "error", data: { message: friendlyError(err) } }).catch(() => {});
      }
    } finally {
      clearInterval(keepalive);
      await hooks.finally?.().catch((err) => console.error(`${label} cleanup failed:`, describeError(err)));
      await writer.close().catch(() => {});
    }
  };
  const work = run();
  if (hooks.waitUntil) hooks.waitUntil(work);
  else void work;

  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
  });
}
