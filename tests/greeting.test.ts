import { describe, expect, it } from "vitest";
import { greeting } from "../src/lib/greeting";

const at = (h: number, m = 0) => new Date(2026, 9, 22, h, m);

describe("greeting", () => {
  it("says good morning before noon", () => {
    expect(greeting(at(9))).toBe("Good morning");
  });

  it("switches to afternoon at noon", () => {
    expect(greeting(at(12))).toBe("Good afternoon");
    expect(greeting(at(16, 59))).toBe("Good afternoon");
  });

  it("switches to evening at 5 pm", () => {
    expect(greeting(at(17))).toBe("Good evening");
  });
});
