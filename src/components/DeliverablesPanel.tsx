import { useState } from "react";
import { IconFileText, IconSparkles } from "@tabler/icons-react";
import type { DeliverableMeta } from "../../shared/conversations";
import { DELIVERABLE_KINDS, DELIVERABLE_LABELS, type DeliverableKind } from "../../shared/deliverables";
import { streamPost } from "../lib/streamDraft";
import { sendToThread } from "../lib/threadStore";
import { DeliverableModal } from "./DeliverableModal";
import { Sparkles } from "./Sparkles";

const SUGGEST =
  "Research and suggest 2–3 options for this trip (resorts, ships or packages) that suit this family: what's included, who each suits, and sources. Mark any prices \"verify before quoting\".";

interface Props {
  tripId: string;
  tripTitle: string;
  deliverables: DeliverableMeta[];
  planned: boolean;
  threadBusy: boolean;
  onChanged(): void;
}

const when = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DeliverablesPanel({ tripId, tripTitle, deliverables, planned, threadBusy, onChanged }: Props) {
  const [making, setMaking] = useState<DeliverableKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [myOptions, setMyOptions] = useState("");

  const busy = making !== null || threadBusy;

  const make = (kind: DeliverableKind) => {
    if (busy) return;
    setMaking(kind);
    setError(null);
    void streamPost(
      `/api/conversations/${tripId}/deliverables`,
      { kind },
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
      new AbortController().signal,
    );
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
              <p className="muted-note">
                Compare 2–4 options. I can research ideas online, you can list your own, or both. Real availability and prices
                come from your supplier and Travefy tools; I'll leave “Add price” for you to fill in.
              </p>
              <button type="button" className="btn-quiet" disabled={busy} onClick={() => addToConversation(SUGGEST)}>
                <IconSparkles size={14} aria-hidden /> Suggest options for me
              </button>
              <label className="field" htmlFor="my-options">
                <span className="field-label">My options (and prices, if you have them)</span>
                <textarea
                  id="my-options"
                  value={myOptions}
                  placeholder={"Pop Century, 7 nights $4,200\nPolynesian, 7 nights $9,800"}
                  onChange={(e) => setMyOptions(e.target.value)}
                />
              </label>
              <div className="proposal-actions">
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={busy || !myOptions.trim()}
                  onClick={() => addToConversation(`Here are the options I'd like to compare:\n${myOptions.trim()}`) && setMyOptions("")}
                >
                  Add to the trip chat
                </button>
                <button type="button" className="btn-primary" disabled={busy} onClick={() => make("proposal")}>
                  Make the proposal
                </button>
              </div>
            </div>
          )}

          {making && (
            <div className="waiting-bubble making">
              <Sparkles />
              <span>Writing your {DELIVERABLE_LABELS[making].toLowerCase()}…</span>
            </div>
          )}
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
