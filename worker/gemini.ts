// Google's Nano Banana (Gemini image) API, called with fetch: one image per request.

export const IMAGE_MODEL = "gemini-nano-banana-2.1";
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${IMAGE_MODEL}:generateContent`;

export type InlineImage = { mimeType: string; data: Uint8Array };

export interface ImageClient {
  generate(request: { prompt: string; images: InlineImage[]; aspect: string }): Promise<InlineImage>;
}

/** What went wrong, without Google's message (which can echo the prompt). */
export class ImageError extends Error {
  constructor(readonly kind: "no-key" | "billing" | "blocked" | "busy" | "failed") {
    super(kind);
    this.name = "ImageError";
  }
}

const CHUNK = 0x8000;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const BLOCKED = new Set(["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT", "IMAGE_PROHIBITED_CONTENT", "BLOCKLIST"]);

type Part = {
  text?: string;
  inlineData?: { mimeType?: string; data?: string };
  inline_data?: { mime_type?: string; data?: string };
};

type Reply = {
  promptFeedback?: { blockReason?: string };
  candidates?: { content?: { parts?: Part[] }; finishReason?: string }[];
};

async function failure(res: Response): Promise<ImageError> {
  if (res.status === 429) return new ImageError("busy");
  const text = (await res.text().catch(() => "")).toLowerCase();
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    if (text.includes("billing")) return new ImageError("billing");
    if (text.includes("api key") || text.includes("api_key")) return new ImageError("no-key");
  }
  return new ImageError("failed");
}

export function defaultImageClient(env: Env, fetchImpl: typeof fetch = fetch): ImageClient {
  return {
    async generate({ prompt, images, aspect }) {
      const key = env.GEMINI_API_KEY;
      if (!key) throw new ImageError("no-key");
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }, ...images.map((i) => ({ inlineData: { mimeType: i.mimeType, data: toBase64(i.data) } }))],
            },
          ],
          generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: "1K" } },
        }),
      });
      if (!res.ok) throw await failure(res);
      const reply = (await res.json().catch(() => ({}))) as Reply;
      if (reply.promptFeedback?.blockReason) throw new ImageError("blocked");
      const candidate = reply.candidates?.[0];
      for (const part of candidate?.content?.parts ?? []) {
        const data = part.inlineData?.data ?? part.inline_data?.data;
        const mimeType = part.inlineData?.mimeType ?? part.inline_data?.mime_type ?? "image/png";
        if (data) return { mimeType, data: fromBase64(data) };
      }
      throw new ImageError(candidate?.finishReason && BLOCKED.has(candidate.finishReason) ? "blocked" : "failed");
    },
  };
}
