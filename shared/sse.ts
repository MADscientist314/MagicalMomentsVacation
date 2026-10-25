// The small server-sent-events protocol between the Worker and the browser.

export type ServerEvent =
  | { event: "text"; data: string }
  | { event: "status"; data: { phase: "searching" | "writing" } }
  | { event: "done"; data: { stopReason: string; sources: { title: string; url: string }[] } }
  | { event: "error"; data: { message: string } }
  | { event: "deliverable"; data: { id: string; kind: "proposal" | "itinerary" | "estimate"; version: number } };

export const KEEPALIVE = ": keepalive\n\n";

export function encodeEvent(e: ServerEvent): string {
  return `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`;
}

export class EventParser {
  private buffer = "";

  push(chunk: string): ServerEvent[] {
    this.buffer += chunk;
    const frames = this.buffer.split("\n\n");
    this.buffer = frames.pop() ?? "";
    const events: ServerEvent[] = [];
    for (const frame of frames) {
      let name = "";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event: ")) name = line.slice(7);
        else if (line.startsWith("data: ")) data = line.slice(6);
      }
      if (name && data) events.push({ event: name, data: JSON.parse(data) } as ServerEvent);
    }
    return events;
  }
}
