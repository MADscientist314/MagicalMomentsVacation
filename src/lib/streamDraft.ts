import { EventParser } from "../../shared/sse";
import type { DraftRequest } from "../../shared/tools";

export interface DraftHandlers {
  text(t: string): void;
  status(phase: "searching" | "writing"): void;
  done(d: { stopReason: string; sources: { title: string; url: string }[] }): void;
  error(message: string): void;
  deliverable?(d: { id: string; kind: "proposal" | "itinerary" | "estimate"; version: number }): void;
}

const OFFLINE = "Couldn't reach the assistant — check the internet connection.";
const GENERIC = "Something went wrong — try again.";
const SIGNED_OUT = "Your sign-in expired — reload the page to sign in again.";

export const streamDraft = (body: DraftRequest, on: DraftHandlers, signal: AbortSignal) =>
  streamPost("/api/draft", body, on, signal);

/** POSTs JSON and reads the reply as our SSE stream (drafts, trip and chat replies, deliverables). */
export async function streamPost(url: string, body: unknown, on: DraftHandlers, signal: AbortSignal): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    if (!signal.aborted) on.error(OFFLINE);
    return;
  }

  const type = res.headers.get("content-type") ?? "";
  if (!res.ok) {
    const json = type.includes("application/json") ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
    on.error(json?.error ?? (res.status === 401 ? SIGNED_OUT : GENERIC));
    return;
  }
  // A proxy in front (e.g. Cloudflare Access, if added) may answer with a login page instead.
  if (!type.includes("text/event-stream") || !res.body) {
    on.error(SIGNED_OUT);
    return;
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const parser = new EventParser();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      for (const e of parser.push(value)) {
        if (e.event === "text") on.text(e.data);
        else if (e.event === "status") on.status(e.data.phase);
        else if (e.event === "done") on.done(e.data);
        else if (e.event === "deliverable") on.deliverable?.(e.data);
        else on.error(e.data.message);
        if (signal.aborted) return;
      }
    }
  } catch {
    if (!signal.aborted) on.error(OFFLINE);
  }
}
