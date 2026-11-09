// Reading supplier quotes from pictures: limits shared by the browser (which shrinks and slices the
// screenshot) and the Worker (which checks what arrives before Claude reads it).

/** A tall screenshot is sent as slices this tall (and at most this wide), so small print stays readable. */
export const QUOTE_TILE_PX = 1_568;
/** Most slices or scanned pages read at once. */
export const MAX_QUOTE_IMAGES = 10;
/** Each slice, decoded (the API takes up to 5 MB of base64). */
export const MAX_QUOTE_IMAGE_BYTES = 3_700_000;
export const QUOTE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type QuoteImageType = (typeof QUOTE_IMAGE_TYPES)[number];
/** What Claude answers when a picture has no text in it. */
export const NO_TEXT = "NO_TEXT";
