import type { DraftRequest } from "../../shared/tools";

export type Phase = "idle" | "waiting" | "searching" | "writing" | "done";

export interface DraftState {
  draft: string;
  phase: Phase;
  sources: { title: string; url: string }[];
  stopReason: string | null;
  error: string | null;
  /** True once the current request has produced its first words. */
  receiving: boolean;
  /** The request behind the draft on screen; refinements build on this. */
  committed: DraftRequest | null;
  /** The request in flight; becomes `committed` when its first words arrive. */
  pending: DraftRequest | null;
}

export type DraftAction =
  | { type: "start"; body: DraftRequest }
  | { type: "text"; text: string }
  | { type: "status"; phase: "searching" | "writing" }
  | { type: "done"; stopReason: string; sources: { title: string; url: string }[] }
  | { type: "error"; message: string }
  | { type: "reset" };

export const initialDraftState: DraftState = {
  draft: "",
  phase: "idle",
  sources: [],
  stopReason: null,
  error: null,
  receiving: false,
  committed: null,
  pending: null,
};

// The previous draft stays on screen until the new one starts arriving, so a refine
// that fails (too long, busy, offline) never takes away the last good version.
export function draftReducer(s: DraftState, a: DraftAction): DraftState {
  switch (a.type) {
    case "start":
      return { ...s, phase: "waiting", error: null, stopReason: null, receiving: false, pending: a.body };
    case "text":
      return s.receiving
        ? { ...s, phase: "writing", draft: s.draft + a.text }
        : { ...s, phase: "writing", draft: a.text, sources: [], receiving: true, committed: s.pending };
    case "status":
      return { ...s, phase: a.phase };
    case "done":
      return s.receiving
        ? { ...s, phase: "done", stopReason: a.stopReason, sources: a.sources, pending: null }
        : { ...s, phase: "done", stopReason: a.stopReason, pending: null };
    case "error":
      return { ...s, phase: "done", error: a.message, pending: null };
    case "reset":
      return initialDraftState;
  }
}
