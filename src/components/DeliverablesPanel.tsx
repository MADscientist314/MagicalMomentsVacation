import { useRef, useState } from "react";
import { IconFileText, IconPlayerStopFilled, IconSparkles } from "@tabler/icons-react";
import { MAX_MESSAGE, type DeliverableMeta } from "../../shared/conversations";
import { DELIVERABLE_KINDS, DELIVERABLE_LABELS, type DeliverableKind } from "../../shared/deliverables";
import { joinTranscript } from "../lib/speech";
import { streamPost } from "../lib/streamDraft";
import { sendToThread } from "../lib/threadStore";
import { DeliverableModal } from "./DeliverableModal";
import { MicButton } from "./MicButton";
import { Sparkles } from "./Sparkles";
import { TextBox } from "./TextBox";

const SUGGEST =
  "Research and suggest 2–3 options for this trip (resorts, ships or packages) that suit this family: what's included, who each suits, and sources. Mark any prices \"verify before quoting\".";

interface Props {
  tripId: string;
  tripTitle: string;
  deliverables: DeliverableMeta[];
  planned: boolean;
  threadBusy: boolean;
  /** The trip came with a supplier itinerary or email, so a one-option proposal is the likely ask. */
  hasMaterial: boolean;
  onChanged(): void;
}

type Shape = "one" | "compare";
const OPTIONS_PREFIX = "Here are the options I'd like to compare:\n";

const when = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DeliverablesPanel({ tripId, tripTitle, deliverables, planned, threadBusy, hasMaterial, onChanged }: Props) {
  const [making, setMaking] = useState<DeliverableKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [shape, setShape] = useState<Shape>(hasMaterial ? "one" : "compare");
  const [myOptions, setMyOptions] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const busy = making !== null || threadBusy;
  const optionsLimit = MAX_MESSAGE - OPTIONS_PREFIX.length;

  const make = (kind: DeliverableKind, options?: Shape) => {
    if (busy) return;
    setMaking(kind);
    setError(null);
    setNote(null);
    const abort = new AbortController();
    controller.current = abort;
    void streamPost(
      `/api/conversations/${tripId}/deliverables`,
      options ? { kind, options } : { kind },
      {
        text: () => {},
        status: () => {},
        deliverable: (d) => setOpenId(d.id),
        done: () => {
          setMaking(null);
          setProposalOpen(false);
          onChanged();
        },
        error: (message) => {
          setMaking(null);
          setError(message);
        },
      },
      abort.signal,
    );
  };

  // The server stops writing when the browser goes, and saves nothing.
  const stop = () => {
    controller.current?.abort();
    controller.current = null;
    setMaking(null);
    setNote("Stopped. Nothing was saved.");
  };

  const addToConversation = (text: string) => {
    // sendToThread ignores the call while a reply is running; keep her text in the box then.
    if (threadBusy) return false;
    const problem = sendToThread(tripId, text, onChanged);
    setError(problem);
    return !problem;
  };

  return (
    <aside className="card deliverables">
      <h2>Client deliverables</h2>
      {!planned ? (
        <p className="muted-note">Plan the trip first. Then you can turn it into a proposal, an itinerary or an estimate.</p>
      ) : (
        <>
          <div className="make-buttons">
            {DELIVERABLE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`btn-quiet${kind === "proposal" && proposalOpen ? " active" : ""}`}
                disabled={busy}
                onClick={() => (kind === "proposal" ? setProposalOpen((o) => !o) : make(kind))}
              >
                <IconSparkles size={14} aria-hidden /> {DELIVERABLE_LABELS[kind]}
              </button>
            ))}
          </div>

          {proposalOpen && (
            <div className="proposal-panel">
              <div className="choices" role="radiogroup" aria-label="What kind of proposal?">
                {(["one", "compare"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={shape === s}
                    className={shape === s ? "choice chosen" : "choice"}
                    onClick={() => setShape(s)}
                  >
                    {s === "one" ? "Just this trip" : "Compare options"}
                  </button>
                ))}
              </div>
              {shape === "one" ? (
                <p className="muted-note">
                  One polished option: the trip as planned here, including any itinerary you pasted or attached. You can change the
                  wording before you send it.
                </p>
              ) : (
                <>
                  <p className="muted-note">
                    Compare 2–4 options. I can research ideas online, you can list your own, or both. Real availability and prices
                    come from your supplier and Travefy tools; I'll leave “Add price” for you to fill in.
                  </p>
                  <button type="button" className="btn-quiet" disabled={busy} onClick={() => addToConversation(SUGGEST)}>
                    <IconSparkles size={14} aria-hidden /> Suggest options for me
                  </button>
                  <div className="field field-options">
                    <div className="field-head">
                      <label className="field-label" htmlFor="my-options">
                        My options (and prices, if you have them)
                      </label>
                      <MicButton onSpeech={(heard) => setMyOptions((v) => joinTranscript(v, heard))} disabled={busy} />
                    </div>
                    <TextBox
                      id="my-options"
                      rows={3}
                      limit={optionsLimit}
                      value={myOptions}
                      placeholder={"Pop Century, 7 nights $4,200\nPolynesian, 7 nights $9,800"}
                      onChange={setMyOptions}
                    />
                  </div>
                </>
              )}
              <div className="proposal-actions">
                {shape === "compare" && (
                  <button
                    type="button"
                    className="btn-quiet"
                    disabled={busy || !myOptions.trim() || myOptions.length > optionsLimit}
                    onClick={() => addToConversation(`${OPTIONS_PREFIX}${myOptions.trim()}`) && setMyOptions("")}
                  >
                    Add to the trip chat
                  </button>
                )}
                <button type="button" className="btn-primary" disabled={busy} onClick={() => make("proposal", shape)}>
                  Make the proposal
                </button>
              </div>
            </div>
          )}

          {making && (
            <div className="waiting-bubble making">
              <Sparkles />
              <span>Writing your {DELIVERABLE_LABELS[making].toLowerCase()}…</span>
              <button type="button" className="btn-stop small" onClick={stop}>
                <IconPlayerStopFilled size={14} aria-hidden />
                Stop
              </button>
            </div>
          )}
          {note && !making && <p className="message message-info">{note}</p>}
          {error && (
            <p className="message message-error" role="alert">
              {error}
            </p>
          )}

          {deliverables.length > 0 && (
            <ul className="doc-list">
              {deliverables.map((d) => (
                <li key={d.id}>
                  <button type="button" className="doc-link" onClick={() => setOpenId(d.id)}>
                    <IconFileText size={16} aria-hidden />
                    <span>
                      {DELIVERABLE_LABELS[d.kind]} · v{d.version}
                    </span>
                    <span className="muted-note">{when(d.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {openId && <DeliverableModal key={openId} id={openId} tripId={tripId} tripTitle={tripTitle} onClose={() => setOpenId(null)} onSaved={onChanged} />}
    </aside>
  );
}
