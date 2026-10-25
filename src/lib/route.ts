import { isToolId, type ToolId } from "../../shared/tools";

export type Route =
  | { page: "home" }
  | { page: "trips" }
  | { page: "new-trip" }
  | { page: "trip"; id: string }
  | { page: "chat"; id?: string }
  | { page: "tool"; tool: ToolId };

export function parseRoute(hash: string): Route {
  const [first, second] = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (!first) return { page: "home" };
  // The Adventure Planner now lives in its trips list.
  if (first === "trips" || first === "adventure-planner") {
    if (first === "trips" && second === "new") return { page: "new-trip" };
    if (first === "trips" && second) return { page: "trip", id: second };
    return { page: "trips" };
  }
  if (first === "chat") return second ? { page: "chat", id: second } : { page: "chat" };
  if (isToolId(first)) return { page: "tool", tool: first };
  return { page: "home" };
}
