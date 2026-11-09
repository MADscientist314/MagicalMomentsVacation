// Reads the text out of a screenshot of a supplier's page (a Mac screenshot, a picture pasted from the
// clipboard, a phone photo of a printout) by sending it to the assistant. The picture is shrunk and,
// if it's tall, cut into overlapping slices first, so small print stays readable. Nothing is saved.
import { MAX_QUOTE_IMAGES, MAX_QUOTE_IMAGE_BYTES, QUOTE_TILE_PX } from "../../shared/quotes";
import { renderPdfPages } from "./pdfText";

export class ImageReadError extends Error {}

const HEIC = /\.(heic|heif)$/i;
const OVERLAP = 120;

/**
 * Where to cut a picture `width` × `height` (already scaled to fit QUOTE_TILE_PX wide): top edges of
 * slices at most QUOTE_TILE_PX tall, overlapping a little so no line is cut in half without a copy.
 */
export function sliceTops(height: number, tile = QUOTE_TILE_PX, overlap = OVERLAP): number[] {
  if (height <= tile) return [0];
  const tops: number[] = [];
  for (let top = 0; ; top += tile - overlap) {
    if (top + tile >= height) {
      tops.push(Math.max(0, height - tile));
      break;
    }
    tops.push(top);
  }
  return tops;
}

/** How much to shrink a picture so it's at most QUOTE_TILE_PX wide and needs no more than MAX_QUOTE_IMAGES slices. */
export function fitScale(width: number, height: number): number {
  let scale = Math.min(1, QUOTE_TILE_PX / width);
  while (sliceTops(Math.round(height * scale)).length > MAX_QUOTE_IMAGES) scale *= 0.9;
  return scale;
}

async function loadImage(file: Blob & { name: string }): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } catch {
    if (HEIC.test(file.name) || /hei[cf]/.test(file.type)) {
      throw new ImageReadError(
        "This browser can't open HEIC photos. On a Mac, open it in Preview and choose File › Export › JPEG, or take a screenshot of it instead.",
      );
    }
    throw new ImageReadError("I couldn't open that picture. Try saving it as a PNG or JPEG.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]+,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function canvasJpeg(canvas: HTMLCanvasElement): Promise<string> {
  for (const quality of [0.9, 0.8, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= MAX_QUOTE_IMAGE_BYTES) return toBase64(blob);
  }
  throw new ImageReadError("That picture is too big to read — try a smaller screenshot.");
}

/** A picture (or a drawn PDF page) cut into slices the assistant can read, as base64 JPEGs. */
export async function slicesOf(source: CanvasImageSource, width: number, height: number): Promise<string[]> {
  const scale = fitScale(width, height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const slices: string[] = [];
  for (const top of sliceTops(h)) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = Math.min(QUOTE_TILE_PX, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageReadError("This browser couldn't prepare that picture. Try again.");
    // Screenshots can have see-through parts; on white they read like the page did.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, top / scale, width, canvas.height / scale, 0, 0, w, canvas.height);
    slices.push(await canvasJpeg(canvas));
  }
  return slices;
}

/** Sends slices to be read; the text that comes back has card, SSN and passport numbers taken out. */
export async function readSlices(slices: string[]): Promise<string> {
  const res = await fetch("/api/read-image", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ images: slices.map((data) => ({ type: "image/jpeg", data })) }),
  }).catch(() => {
    throw new ImageReadError("Couldn't reach the assistant — check the internet connection.");
  });
  const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
  if (!res.ok || typeof body.text !== "string") throw new ImageReadError(body.error ?? "I couldn't read that picture. Try again.");
  return body.text;
}

/** The text in a screenshot or photo. */
export async function readImageText(file: Blob & { name: string }): Promise<string> {
  const img = await loadImage(file);
  return readSlices(await slicesOf(img, img.naturalWidth, img.naturalHeight));
}

/** A scanned PDF (pictures of pages, no text in it): each page drawn in the browser, then read. */
export async function readScannedPdf(data: Uint8Array): Promise<{ text: string; pagesRead: number; totalPages: number }> {
  const { canvases, totalPages } = await renderPdfPages(data, MAX_QUOTE_IMAGES, QUOTE_TILE_PX);
  const slices: string[] = [];
  for (const canvas of canvases) slices.push(await canvasJpeg(canvas));
  return { text: await readSlices(slices), pagesRead: canvases.length, totalPages };
}
