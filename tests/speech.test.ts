import { describe, expect, it } from "vitest";
import { getSpeechRecognition, joinTranscript } from "../src/lib/speech";

describe("getSpeechRecognition", () => {
  class Standard {}
  class Webkit {}

  it("prefers the standard API", () => {
    expect(getSpeechRecognition({ SpeechRecognition: Standard, webkitSpeechRecognition: Webkit })).toBe(Standard);
  });

  it("falls back to the Safari/Chrome prefixed API", () => {
    expect(getSpeechRecognition({ webkitSpeechRecognition: Webkit })).toBe(Webkit);
  });

  it("returns null where the browser can't listen", () => {
    expect(getSpeechRecognition({})).toBeNull();
  });
});

describe("joinTranscript", () => {
  it("adds spoken words after what's already typed", () => {
    expect(joinTranscript("Plan a trip", " for the Riveras ")).toBe("Plan a trip for the Riveras");
  });

  it("uses the spoken words alone when the box is empty", () => {
    expect(joinTranscript("", "hello there")).toBe("hello there");
  });

  it("ignores silence", () => {
    expect(joinTranscript("keep this ", "  ")).toBe("keep this ");
  });
});
