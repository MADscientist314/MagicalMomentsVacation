// Images made with Google's Nano Banana for posts and trip cards, and the photos Jillian uploads for them.

export type Shape = "square" | "portrait" | "story" | "wide";

export const SHAPES: Record<Shape, { label: string; aspect: string }> = {
  square: { label: "Square", aspect: "1:1" },
  portrait: { label: "Portrait", aspect: "4:5" },
  story: { label: "Story", aspect: "9:16" },
  wide: { label: "Wide", aspect: "16:9" },
};

export const isShape = (x: unknown): x is Shape => typeof x === "string" && Object.hasOwn(SHAPES, x);

/** Feed posts look best tall; newsletter and website headers look best wide. */
export function defaultShape(channel?: string): Shape {
  return channel === "Newsletter" || channel === "Website promo" ? "wide" : "portrait";
}

export type CardKind = "countdown" | "birthday" | "welcome-home" | "bon-voyage";

export const CARD_KINDS: Record<CardKind, string> = {
  countdown: "Countdown",
  birthday: "Happy birthday",
  "welcome-home": "Welcome home",
  "bon-voyage": "Bon voyage",
};

export const isCardKind = (x: unknown): x is CardKind => typeof x === "string" && Object.hasOwn(CARD_KINDS, x);

/** A saved Spread the Magic post or a trip; every image belongs to one. */
export type ImageOwner = { type: "draft" | "trip"; id: string };

export interface ImageMeta {
  id: string;
  kind: "upload" | "generated";
  shape: Shape | null;
  /** Her direction for a generated image (masked); empty for uploads. */
  prompt: string;
  created_at: number;
}

export const MAX_PHOTO_BYTES = 5_000_000;
export const MAX_DIRECTION = 1_000;
export const MAX_REFERENCE_PHOTOS = 3;
/** Across the whole site in any 24 hours: a cost guard, since the magic words are shared. */
export const DAILY_IMAGE_LIMIT = 100;
/** Nano Banana 2.1 at 1K (Google's price list, 10/31/2026). */
export const IMAGE_COST_USD = 0.0336;
