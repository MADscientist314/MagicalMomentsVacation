// Shrinks a photo in the browser before upload: phone photos are 3–8 MB, and 1600 px is plenty for Nano Banana.

const MAX_SIDE = 1600;
const UNREADABLE = "Couldn't read that photo — try a JPEG or PNG.";

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Decodes with an <img> (so Safari can read iPhone HEIC photos) and re-encodes as JPEG. */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode().catch(() => {
      throw new Error(UNREADABLE);
    });
    const size = fitWithin(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || !size.width || !size.height) throw new Error(UNREADABLE);
    ctx.drawImage(img, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error(UNREADABLE);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}
