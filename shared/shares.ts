// Share links: a client document as a private web page for the family, for about 30 days.

/** How long a link works after she shares (or re-shares) it. */
export const SHARE_DAYS = 30;
export const SHARE_MS = SHARE_DAYS * 24 * 60 * 60_000;

/** 24 random bytes, base64url: unguessable, and safe in a URL path. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{32}$/;

export const sharePath = (token: string) => `/p/${token}`;

/** What the app shows about a document's link. */
export interface ShareInfo {
  /** The page's path, e.g. "/p/abc…"; the app puts its own address in front. */
  path: string;
  /** The version the family sees, which may be older than the one open. */
  deliverableId: string;
  version: number;
  expiresAt: number;
}
