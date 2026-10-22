import { describe, expect, it } from "vitest";
import { verifyAccess } from "../worker/access";

const req = (headers: Record<string, string> = {}) => new Request("https://app.test/api/draft", { headers });
const env = (over: Partial<Env>) => ({ ANTHROPIC_API_KEY: "k", ACCESS_MODE: "on", TEAM_DOMAIN: "", POLICY_AUD: "", ...over }) as Env;

describe("verifyAccess", () => {
  it("lets local development through when Access is off", async () => {
    expect(await verifyAccess(req(), env({ ACCESS_MODE: "off" }))).toEqual({ email: "local" });
  });

  it("fails closed when Access isn't configured", async () => {
    const result = await verifyAccess(req(), env({}));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(500);
  });

  it("rejects a request with no Access token", async () => {
    const result = await verifyAccess(req(), env({ TEAM_DOMAIN: "https://team.cloudflareaccess.com", POLICY_AUD: "aud" }));
    expect((result as Response).status).toBe(401);
  });

  it("rejects a malformed Access token", async () => {
    const result = await verifyAccess(
      req({ "Cf-Access-Jwt-Assertion": "not-a-jwt" }),
      env({ TEAM_DOMAIN: "https://team.cloudflareaccess.com", POLICY_AUD: "aud" }),
    );
    expect((result as Response).status).toBe(401);
  });
});
