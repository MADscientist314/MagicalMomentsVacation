// Carries a Welcome Center "Trip hand-off" to the New trip form (this tab only).
import type { TripHandoff } from "../../shared/sections";

const KEY = "mmv-trip-handoff";

export function giveHandoff(h: TripHandoff) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // Storage blocked: the form just starts empty.
  }
}

/** Reads the hand-off without removing it (safe to call more than once). */
export function peekHandoff(): Record<string, string> | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function clearHandoff() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
