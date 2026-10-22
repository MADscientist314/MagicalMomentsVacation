import Anthropic from "@anthropic-ai/sdk";
import type {
  BetaContentBlock,
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaRawMessageStreamEvent,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../shared/guard";
import { encodeEvent, KEEPALIVE, type ServerEvent } from "../shared/sse";
import { isToolId, TOOLS, type DraftRequest } from "../shared/tools";
import { buildSystem, buildUserMessage } from "./prompt";

const MODEL = "claude-opus-5-5";
const MAX_REFINEMENTS = 5;
const MAX_TOTAL_CHARS = 60_000;
const MAX_REFINE_REQUEST = 2_000;
const MAX_PAUSE_RESUMES = 3;

/** The slice of the Anthropic client this handler uses (injectable for tests). */
export interface DraftClient {
  beta: {
    messages: {
      stream(
        params: BetaMessageStreamParams,
        options?: { signal?: AbortSignal },
      ): AsyncIterable<BetaRawMessageStreamEvent> & { finalMessage(): Promise<BetaMessage> };
    };
  };
}

const defaultClient = (env: Env): DraftClient => new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

type Validated = { ok: true; req: DraftRequest } | { ok: false; status: number; error: string };

const BAD_REQUEST = "That request didn't make sense — try again.";

function validate(body: unknown): Validated {
  if (typeof body !== "object" || body === null) return { ok: false, status: 400, error: BAD_REQUEST };
  const { tool, fields, refinements = [] } = body as Record<string, unknown>;
  if (!isToolId(tool)) return { ok: false, status: 400, error: "Unknown tool." };
  if (typeof fields !== "object" || fields === null) return { ok: false, status: 400, error: BAD_REQUEST };
  if (!Array.isArray(refinements)) return { ok: false, status: 400, error: BAD_REQUEST };

  const clean: Record<string, string> = {};
  for (const f of TOOLS[tool].fields) {
    const value = (fields as Record<string, unknown>)[f.id] ?? "";
    if (typeof value !== "string") return { ok: false, status: 400, error: BAD_REQUEST };
    if (f.required && !value.trim()) return { ok: false, status: 400, error: `Fill in “${f.label}” first.` };
    if (value.length > f.maxLength) {
      return { ok: false, status: 400, error: `“${f.label}” is too long — keep it under ${f.maxLength} characters.` };
    }
    if (f.options && value && !f.options.includes(value)) return { ok: false, status: 400, error: BAD_REQUEST };
    clean[f.id] = value;
  }

  if (refinements.length > MAX_REFINEMENTS) {
    return { ok: false, status: 413, error: "This draft has been refined a lot — start over to keep going." };
  }
  const refs: { draft: string; request: string }[] = [];
  for (const r of refinements) {
    const { draft, request } = (r ?? {}) as Record<string, unknown>;
    if (typeof draft !== "string" || typeof request !== "string" || request.length > MAX_REFINE_REQUEST) {
      return { ok: false, status: 400, error: BAD_REQUEST };
    }
    refs.push({ draft, request });
  }

  const allText = [...Object.values(clean), ...refs.flatMap((r) => [r.draft, r.request])];
  if (allText.reduce((n, t) => n + t.length, 0) > MAX_TOTAL_CHARS) {
    return { ok: false, status: 413, error: "This conversation has gotten long — start over to keep going." };
  }
  const sensitive = findSensitive(allText.join("\n"));
  if (sensitive.length) return { ok: false, status: 400, error: SENSITIVE_MESSAGES[sensitive[0]] };

  return { ok: true, req: { tool, fields: clean, refinements: refs } };
}

function buildMessages(req: DraftRequest): BetaMessageParam[] {
  const masked = Object.fromEntries(Object.entries(req.fields).map(([k, v]) => [k, maskContacts(v).text]));
  const messages: BetaMessageParam[] = [{ role: "user", content: buildUserMessage(req.tool, masked) }];
  for (const r of req.refinements ?? []) {
    messages.push({ role: "assistant", content: r.draft }, { role: "user", content: maskContacts(r.request).text });
  }
  return messages;
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

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "The assistant isn't connected yet (API key).";
  if (err instanceof Anthropic.RateLimitError) return "It's busy right now — try again in a minute.";
  if (err instanceof Anthropic.APIConnectionError) return "Couldn't reach the assistant — check the internet connection.";
  return "Something went wrong — try again.";
}

export async function handleDraft(
  request: Request,
  env: Env,
  makeClient: (env: Env) => DraftClient = defaultClient,
  keepaliveMs = 15_000,
): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: BAD_REQUEST }, { status: 400 });
  }
  const checked = validate(body);
  if (!checked.ok) return Response.json({ error: checked.error }, { status: checked.status });

  const { req } = checked;
  const tool = TOOLS[req.tool];
  const params: BetaMessageStreamParams = {
    model: MODEL,
    max_tokens: 16_000,
    system: buildSystem(req.tool),
    messages: buildMessages(req),
    output_config: { effort: tool.effort },
    ...(tool.webSearch ? { tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }] } : {}),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  };

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
      const sources = new Map<string, { title: string; url: string }>();
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
            await send({ event: "text", data: event.delta.text });
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
      await send({ event: "done", data: { stopReason, sources: [...sources.values()] } });
    } catch (err) {
      if (!abort.signal.aborted) {
        await send({ event: "error", data: { message: friendlyError(err) } }).catch(() => {});
      }
    } finally {
      clearInterval(keepalive);
      await writer.close().catch(() => {});
    }
  };
  void run();

  return new Response(readable, {
    headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store" },
  });
}
