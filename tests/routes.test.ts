import { describe, expect, it } from "vitest";
import worker from "../worker/index";
import { fakeD1 } from "./helpers/fakeD1";

const ENV = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "test-magic-words", DB: fakeD1() } as Env;
const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://app.test${path}`, init), ENV, CTX);

async function loginCookie(): Promise<string> {
  const res = await call("/api/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "test magic words" }),
  });
  return res.headers.get("set-cookie")!.split(";")[0];
}

describe("worker routes", () => {
  it("refuses drafts without signing in", async () => {
    const res = await call("/api/draft", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
  });

  it("reads the body of a refused POST, so the connection stays usable", async () => {
    const request = new Request("https://app.test/api/draft", { method: "POST", body: JSON.stringify({ tool: "magic-mail" }) });
    expect((await worker.fetch(request, ENV, CTX)).status).toBe(401);
    expect(request.bodyUsed).toBe(true);
  });

  it("refuses saved trips and chats without signing in", async () => {
    expect((await call("/api/drafts?tool=welcome-center")).status).toBe(401);
    expect((await call("/api/conversations?kind=trip")).status).toBe(401);
    expect((await call("/api/deliverables/abc")).status).toBe(401);
  });

  it("lists saved trips for a signed-in visitor", async () => {
    const res = await call("/api/conversations?kind=trip", { headers: { cookie: await loginCookie() } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("lists saved drafts for a signed-in visitor", async () => {
    const res = await call("/api/drafts?tool=welcome-center", { headers: { cookie: await loginCookie() } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("no longer serves the old stateless chat", async () => {
    expect((await call("/api/chat", { method: "POST", headers: { cookie: await loginCookie() }, body: "{}" })).status).toBe(404);
  });

  it("reports whether the visitor is signed in", async () => {
    expect((await call("/api/session")).status).toBe(401);
    expect((await call("/api/session", { headers: { cookie: await loginCookie() } })).status).toBe(200);
  });

  it("lets a signed-in visitor through to the draft checks", async () => {
    const res = await call("/api/draft", {
      method: "POST",
      headers: { cookie: await loginCookie(), "content-type": "application/json" },
      body: JSON.stringify({ tool: "nope", fields: {} }),
    });
    expect(res.status).toBe(400);
  });

  it("signs out", async () => {
    expect((await call("/api/logout", { method: "POST" })).headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
