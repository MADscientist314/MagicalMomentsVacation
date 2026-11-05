import { describe, expect, it } from "vitest";
import { movedTo } from "../src/lib/moved";

describe("movedTo", () => {
  it("sends the old address to the new one, on the same page", () => {
    expect(movedTo({ hostname: "magical-assistant.magicalvacations.workers.dev", hash: "#/trips/abc" })).toBe(
      "https://magicalvacations.pilotandproof.com/#/trips/abc",
    );
    expect(movedTo({ hostname: "magical-assistant.magicalvacations.workers.dev", hash: "" })).toBe("https://magicalvacations.pilotandproof.com/");
  });

  it("leaves the new address, previews and local development alone", () => {
    expect(movedTo({ hostname: "magicalvacations.pilotandproof.com", hash: "#/trips" })).toBeNull();
    expect(movedTo({ hostname: "abc123-magical-assistant.magicalvacations.workers.dev", hash: "" })).toBeNull();
    expect(movedTo({ hostname: "localhost", hash: "" })).toBeNull();
  });
});
