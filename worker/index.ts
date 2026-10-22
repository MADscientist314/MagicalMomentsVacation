import { verifyAccess } from "./access";
import { handleDraft } from "./draft";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/draft") {
      if (request.method !== "POST") return Response.json({ error: "Use POST." }, { status: 405 });
      const who = await verifyAccess(request, env);
      if (who instanceof Response) return who;
      return handleDraft(request, env);
    }
    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "not found" }, { status: 404 });
    }
    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
