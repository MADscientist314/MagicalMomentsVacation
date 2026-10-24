import { afterEach, describe, expect, it, vi } from "vitest";
import { checkSession, signIn } from "../src/lib/session";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("signIn", () => {
  it("returns no error when the magic words are right", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    expect(await signIn("test magic words")).toBeNull();
  });

  it("returns the server's message when they're wrong", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "That's not quite the magic word — try again." }, { status: 401 })));
    expect(await signIn("open sesame")).toBe("That's not quite the magic word — try again.");
  });

  it("explains when the site can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("offline");
    }));
    expect(await signIn("x")).toBe("Couldn't reach the assistant — check the internet connection.");
  });
});

describe("checkSession", () => {
  it("is true only when the server says so", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    expect(await checkSession()).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "x" }, { status: 401 })));
    expect(await checkSession()).toBe(false);
  });
});
