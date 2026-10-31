import { describe, expect, it } from "vitest";
import { fitWithin } from "../src/lib/photos";

describe("fitWithin", () => {
  it("shrinks phone photos to 1600 px on the long side, keeping the shape", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});
