import { describe, expect, it } from "vitest";
import worker from "../worker/index";

const ENV = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "test-magic-words" } as Env;
const call = (path: string, init?: RequestInit) => worker.fetch(new Request(`https://app.test${path}`, init), ENV);

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

  it("refuses chat without signing in", async () => {
    const res = await call("/api/chat", { method: "POST", body: "{}" });
    expect(res.status).toBe(401);
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
