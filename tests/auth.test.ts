import { describe, expect, it } from "vitest";
import {
  handleLogin,
  handleLogout,
  hasValidSession,
  normalizePassword,
  passwordMatches,
  SESSION_COOKIE,
} from "../worker/auth";

const ENV = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "test-magic-words" } as Env;
const DAY = 24 * 60 * 60 * 1000;

const login = (password: string, env = ENV) =>
  handleLogin(
    new Request("https://app.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    }),
    env,
  );

const withCookie = (setCookie: string) =>
  new Request("https://app.test/api/draft", { headers: { cookie: setCookie.split(";")[0] } });

describe("normalizePassword", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(normalizePassword("Test Magic-Words!")).toBe("testmagicwords");
  });
});

describe("passwordMatches", () => {
  it("accepts the magic words however they're typed", async () => {
    expect(await passwordMatches("Test Magic Words", "test-magic-words")).toBe(true);
  });

  it("rejects other words", async () => {
    expect(await passwordMatches("pixie dust", "test-magic-words")).toBe(false);
  });

  it("never matches an empty password", async () => {
    expect(await passwordMatches("", "")).toBe(false);
    expect(await passwordMatches("!!!", "")).toBe(false);
  });
});

describe("handleLogin", () => {
  it("sets a long-lived, locked-down session cookie for the right password", async () => {
    const res = await login("Test Magic Words");
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain(`Max-Age=${30 * 24 * 60 * 60}`);
  });

  it("turns away the wrong password without a cookie", async () => {
    const res = await login("open sesame");
    expect(res.status).toBe(401);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(((await res.json()) as { error: string }).error).toBe("That's not quite the magic word — try again.");
  });

  it("fails closed when no password has been set up", async () => {
    const res = await login("", { ...ENV, APP_PASSWORD: "" });
    expect(res.status).toBe(500);
  });
});

describe("hasValidSession", () => {
  it("accepts the cookie from a successful login", async () => {
    const cookie = (await login("test-magic-words")).headers.get("set-cookie")!;
    expect(await hasValidSession(withCookie(cookie), ENV)).toBe(true);
  });

  it("rejects a request with no cookie", async () => {
    expect(await hasValidSession(new Request("https://app.test/"), ENV)).toBe(false);
  });

  it("rejects a tampered cookie", async () => {
    const cookie = (await login("test-magic-words")).headers.get("set-cookie")!;
    const tampered = cookie.replace(/=(\d+)\./, (_m, exp) => `=${Number(exp) + DAY}.`);
    expect(await hasValidSession(withCookie(tampered), ENV)).toBe(false);
  });

  it("rejects a cookie older than 30 days", async () => {
    const cookie = (await login("test-magic-words")).headers.get("set-cookie")!;
    expect(await hasValidSession(withCookie(cookie), ENV, Date.now() + 31 * DAY)).toBe(false);
  });

  it("signs everyone out when the password changes", async () => {
    const cookie = (await login("test-magic-words")).headers.get("set-cookie")!;
    expect(await hasValidSession(withCookie(cookie), { ...ENV, APP_PASSWORD: "pixie-dust" })).toBe(false);
  });
});

describe("handleLogout", () => {
  it("clears the session cookie", () => {
    expect(handleLogout().headers.get("set-cookie")).toContain("Max-Age=0");
  });
});
