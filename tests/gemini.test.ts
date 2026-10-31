import { describe, expect, it } from "vitest";
import { defaultShape, SHAPES } from "../shared/images";
import { defaultImageClient, fromBase64, IMAGE_MODEL, ImageError, toBase64 } from "../worker/gemini";

const env = (key = "test-key") => ({ GEMINI_API_KEY: key }) as unknown as Env;

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const imageReply = (parts: unknown[]) => ({ candidates: [{ content: { parts }, finishReason: "STOP" }] });

async function kindOf(work: Promise<unknown>): Promise<string> {
  try {
    await work;
    return "none";
  } catch (e) {
    return e instanceof ImageError ? e.kind : "other";
  }
}

describe("shapes", () => {
  it("picks a shape that suits each channel", () => {
    expect(defaultShape("Instagram caption")).toBe("portrait");
    expect(defaultShape("Facebook post")).toBe("portrait");
    expect(defaultShape("Newsletter")).toBe("wide");
    expect(defaultShape("Website promo")).toBe("wide");
    expect(defaultShape()).toBe("portrait");
    expect(SHAPES.story.aspect).toBe("9:16");
  });
});

describe("base64", () => {
  it("round-trips large images", () => {
    const bytes = new Uint8Array(300_000).map((_, i) => (i * 31) % 256);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
  });
});

describe("defaultImageClient", () => {
  it("asks Nano Banana 2.1 for one image in the right shape, with her photos", async () => {
    const f = fakeFetch(200, imageReply([{ text: "Here you go" }, { inlineData: { mimeType: "image/png", data: toBase64(PNG) } }]));
    const photo = { mimeType: "image/jpeg", data: new Uint8Array([0xff, 0xd8, 0xff, 9]) };
    const out = await defaultImageClient(env(), f.impl).generate({ prompt: "A sunny pool day", images: [photo], aspect: "4:5" });

    expect(IMAGE_MODEL).toBe("gemini-nano-banana-2.1");
    expect(f.calls[0].url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent",
    );
    expect(new Headers(f.calls[0].init.headers).get("x-goog-api-key")).toBe("test-key");
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({
      contents: [
        {
          role: "user",
          parts: [{ text: "A sunny pool day" }, { inlineData: { mimeType: "image/jpeg", data: toBase64(photo.data) } }],
        },
      ],
      generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "4:5", imageSize: "1K" } },
    });
    expect(out).toEqual({ mimeType: "image/png", data: PNG });
  });

  it("also reads snake_case inline_data", async () => {
    const f = fakeFetch(200, imageReply([{ inline_data: { mime_type: "image/png", data: toBase64(PNG) } }]));
    const out = await defaultImageClient(env(), f.impl).generate({ prompt: "x", images: [], aspect: "1:1" });
    expect(out.data).toEqual(PNG);
  });

  it("refuses without a key and never calls Google", async () => {
    const f = fakeFetch(200, {});
    expect(await kindOf(defaultImageClient(env(""), f.impl).generate({ prompt: "x", images: [], aspect: "1:1" }))).toBe("no-key");
    expect(f.calls).toHaveLength(0);
  });

  it("keeps Google's reason and explanation when it refuses", async () => {
    const cases: [unknown, string, string | undefined][] = [
      [{ candidates: [{ finishReason: "IMAGE_SAFETY", finishMessage: "Unable to show the generated image." }] }, "IMAGE_SAFETY", "Unable to show the generated image."],
      [{ promptFeedback: { blockReason: "OTHER", blockReasonMessage: "Prompt was blocked." } }, "OTHER", "Prompt was blocked."],
      [{ candidates: [{ finishReason: "IMAGE_RECITATION" }] }, "IMAGE_RECITATION", undefined],
    ];
    for (const [body, reason, note] of cases) {
      const f = fakeFetch(200, body);
      const err = await defaultImageClient(env(), f.impl)
        .generate({ prompt: "x", images: [], aspect: "1:1" })
        .catch((e: ImageError) => e);
      expect(err).toBeInstanceOf(ImageError);
      expect(err).toMatchObject({ kind: "blocked", reason, note });
    }
  });

  it("explains blocked, busy, billing, key and other failures", async () => {
    const cases: [number, unknown, string][] = [
      [200, { promptFeedback: { blockReason: "SAFETY" } }, "blocked"],
      [200, { candidates: [{ content: { parts: [] }, finishReason: "IMAGE_SAFETY" }] }, "blocked"],
      [200, { candidates: [{ finishReason: "IMAGE_PROHIBITED_CONTENT" }] }, "blocked"],
      [200, { candidates: [{ content: { parts: [{ text: "no" }] }, finishReason: "NO_IMAGE" }] }, "failed"],
      [429, { error: { message: "Resource exhausted" } }, "busy"],
      [400, { error: { message: "This API method requires billing to be enabled." } }, "billing"],
      [403, { error: { message: "Billing account not found" } }, "billing"],
      [400, { error: { message: "API key not valid. Please pass a valid API key." } }, "no-key"],
      [500, "oops", "failed"],
    ];
    for (const [status, body, kind] of cases) {
      const f = fakeFetch(status, body);
      expect(await kindOf(defaultImageClient(env(), f.impl).generate({ prompt: "x", images: [], aspect: "1:1" })), JSON.stringify(body)).toBe(kind);
    }
  });
});
