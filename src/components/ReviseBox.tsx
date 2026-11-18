import { useRef, useState } from "react";
import { IconPlayerStopFilled, IconSparkles } from "@tabler/icons-react";
import { DELIVERABLE_LABELS, type DeliverableKind } from "../../shared/deliverables";
import { joinTranscript } from "../lib/speech";
import { streamPost } from "../lib/streamDraft";
import { MicButton } from "./MicButton";
import { Sparkles } from "./Sparkles";
import { TextBox } from "./TextBox";

/** Kept in step with MAX_REVISE_ASK on the server. */
const REVISE_LIMIT = 4_000;

const EXAMPLES: Record<DeliverableKind, string> = {
  proposal: "Taxes and fees are already in the total, take that line out. Make option 2 the recommendation.",
  itinerary: "Swap days 3 and 4, and add a sunset dinner on the last night.",
  estimate: "Add travel insurance as a line still to price.",
  extras: "Add a short list of snacks for the flight.",
};

interface Props {
  kind: DeliverableKind;
  /** The saved version to change; the caller saves her own edits first, so this is always what she sees. */
  prepare(): Promise<string | null>;
  /** The new version, once it's saved. */
  onRevised(id: string, version: number): void;
  disabled?: boolean;
}

/**
 * "Change it with the assistant": she says what to change and the assistant saves it as the next version, prices and
 * pictures kept (John, Nov 17: change the document itself, not by asking the chat).
 */
export function ReviseBox({ kind, prepare, onRevised, disabled }: Props) {
  const [ask, setAsk] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const run = async () => {
    if (busy || !ask.trim()) return;
    setBusy(true);
    setError(null);
    const id = await prepare();
    if (!id) {
      setBusy(false);
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    await streamPost(
      `/api/deliverables/${id}/revise`,
      { ask: ask.trim() },
      {
        text: () => {},
        status: () => {},
        deliverable: (d) => {
          setAsk("");
          onRevised(d.id, d.version);
        },
        done: () => setBusy(false),
        error: (message) => {
          setBusy(false);
          setError(message);
        },
      },
      abort.signal,
    );
  };

  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    setBusy(false);
    setError("Stopped. Nothing was changed.");
  };

  return (
    <div className="revise-box">
      <div className="field">
        <div className="field-head">
          <label className="field-label" htmlFor="revise-ask">
            <IconSparkles size={16} aria-hidden /> Change this {DELIVERABLE_LABELS[kind].toLowerCase()} with the assistant
          </label>
          <MicButton onSpeech={(heard) => setAsk((v) => joinTranscript(v, heard))} disabled={busy || disabled} />
        </div>
        <TextBox
          id="revise-ask"
          rows={2}
          maxHeight={180}
          limit={REVISE_LIMIT}
          value={ask}
          placeholder={EXAMPLES[kind]}
          onChange={setAsk}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void run();
          }}
        />
      </div>
      <div className="revise-actions">
        {busy ? (
          <>
            <span className="revise-sparkles">
              <Sparkles />
            </span>
            <span className="muted-note">Making the change…</span>
            <button type="button" className="btn-stop small" onClick={stop}>
              <IconPlayerStopFilled size={14} aria-hidden /> Stop
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn-primary" disabled={disabled || !ask.trim() || ask.length > REVISE_LIMIT} onClick={() => void run()}>
              Make the change
            </button>
            <span className="muted-note">Saved as a new version. Prices only come from what you gave.</span>
          </>
        )}
      </div>
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
