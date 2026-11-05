// The assistant moved to its own address on 2026-11-05. Old bookmarks forward there.

/** Where the assistant lives now. */
export const HOME = "https://magicalvacations.pilotandproof.com";

/** Addresses it used to have. Preview builds (other *.workers.dev names) and localhost stay put. */
const OLD_HOSTS = ["magical-assistant.magicalvacations.workers.dev"];

/** The new address for a page opened at an old one, keeping the page she was on (after the #), or null. */
export function movedTo(where: { hostname: string; hash: string }): string | null {
  return OLD_HOSTS.includes(where.hostname) ? `${HOME}/${where.hash}` : null;
}
