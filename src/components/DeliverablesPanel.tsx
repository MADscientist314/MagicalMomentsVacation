import { useRef, useState } from "react";
import { IconFileText, IconMail, IconPlayerStopFilled, IconSparkles } from "@tabler/icons-react";
import { MAX_MESSAGE, type DeliverableMeta } from "../../shared/conversations";
import { DELIVERABLE_KINDS, DELIVERABLE_LABELS, EXTRAS_TOPICS, type DeliverableKind, type ExtrasTopic, type Proposal } from "../../shared/deliverables";
import { getDeliverable, shareDeliverable } from "../lib/api";
import { defaultEmailKinds, EMAIL_KINDS, emailRequest, latestByKind, type EmailLink } from "../lib/emailDraft";
import { joinTranscript } from "../lib/speech";
import { streamPost } from "../lib/streamDraft";
import { sendToThread } from "../lib/threadStore";
import { AttachButton, AttachStatus, useAttach } from "./AttachButton";
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
/** Kept in step with MAX_EXTRAS_ASK on the server. */
const EXTRAS_ASK_LIMIT = 2_000;
/** Her own words for the email ("mention the dining plan"). */
const EMAIL_ASK_LIMIT = 2_000;
/** Proposal, Extras and the email open a small chooser first; the others are made straight away. */
type Chooser = "proposal" | "extras" | "email";

const longDay = (ms: number) => new Date(ms).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

const when = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DeliverablesPanel({ tripId, tripTitle, deliverables, planned, threadBusy, hasMaterial, onChanged }: Props) {
  const [making, setMaking] = useState<DeliverableKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [chooser, setChooser] = useState<Chooser | null>(null);
  const [shape, setShape] = useState<Shape>(hasMaterial ? "one" : "compare");
  const [quotes, setQuotes] = useState("");
  const quoteAttacher = useAttach(quotes, setQuotes, MAX_MESSAGE);
  const latest = latestByKind(deliverables);
  const [emailKinds, setEmailKinds] = useState<DeliverableKind[] | null>(null);
  const chosenKinds = (emailKinds ?? defaultEmailKinds(latest)).filter((k) => latest[k]);
  const [emailAsk, setEmailAsk] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [topics, setTopics] = useState<ExtrasTopic[]>(["packing"]);
  const [extrasAsk, setExtrasAsk] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);

  const busy = making !== null || threadBusy || drafting;

  const make = (kind: DeliverableKind, extra: Record<string, unknown> = {}) => {
    if (busy) return;
    setMaking(kind);
    setError(null);
    setNote(null);
    const abort = new AbortController();
    controller.current = abort;
    void streamPost(
      `/api/conversations/${tripId}/deliverables`,
      { kind, ...extra },
      {
        text: () => {},
        status: () => {},
        deliverable: (d) => setOpenId(d.id),
        done: () => {
          setMaking(null);
          setChooser(null);
          if (kind === "extras") setExtrasAsk("");
          if (kind === "proposal") {
            setQuotes("");
            quoteAttacher.dismiss();
          }
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

  /**
   * Puts the newest version of each chosen document on the family's link (making the link if there
   * isn't one), then asks the trip chat for the email, with the links and the quote's totals in it.
   */
  const draftEmail = async () => {
    if (busy || !chosenKinds.length) return;
    setDrafting(true);
    setError(null);
    setNote(null);
    try {
      const links: EmailLink[] = [];
      let expiresAt = Infinity;
      let quote: { version: number; proposal: Proposal } | undefined;
      for (const kind of EMAIL_KINDS.filter((k) => chosenKinds.includes(k))) {
        const doc = latest[kind]!;
        const share = await shareDeliverable(doc.id);
        links.push({ kind, version: doc.version, url: `${window.location.origin}${share.path}` });
        expiresAt = Math.min(expiresAt, share.expiresAt);
        if (kind === "proposal") quote = { version: doc.version, proposal: (await getDeliverable(doc.id)).data as Proposal };
      }
      const text = emailRequest({ links, expiresOn: longDay(expiresAt), quote, ask: emailAsk });
      if (addToConversation(text)) {
        setChooser(null);
        setEmailAsk("");
        setNote("Writing the email in the trip chat. Copy it from there, or open it in your email.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDrafting(false);
    }
  };

  return (
    <aside className="card deliverables">
      <h2>Client deliverables</h2>
      {!planned ? (
        <p className="muted-note">Plan the trip first. Then you can turn it into a proposal, an itinerary, an estimate or extras.</p>
      ) : (
        <>
          <div className="make-buttons">
            {DELIVERABLE_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                className={`btn-quiet${chooser === kind ? " active" : ""}`}
                aria-expanded={kind === "proposal" || kind === "extras" ? chooser === kind : undefined}
                title={kind === "extras" ? "Packing list, apps to download, before-you-go checklist" : undefined}
                disabled={busy}
                onClick={() => (kind === "proposal" || kind === "extras" ? setChooser((c) => (c === kind ? null : kind)) : make(kind))}
              >
                <IconSparkles size={14} aria-hidden /> {DELIVERABLE_LABELS[kind]}
              </button>
            ))}
          </div>
          {(latest.proposal || latest.itinerary || latest.estimate || latest.extras) && (
            <button
              type="button"
              className={`btn-quiet email-button${chooser === "email" ? " active" : ""}`}
              aria-expanded={chooser === "email"}
              disabled={busy}
              title="An email to the family with links to the proposal and itinerary"
              onClick={() => setChooser((c) => (c === "email" ? null : "email"))}
            >
              <IconMail size={14} aria-hidden /> Draft the email to the family
            </button>
          )}

          {chooser === "extras" && (
            <div className="proposal-panel">
              <p className="muted-note">
                A checklist for the family, kept apart from the day-by-day plan. Pick what it should cover, or say what you'd like.
              </p>
              <div className="choices" role="group" aria-label="What should the extras cover?">
                {(Object.keys(EXTRAS_TOPICS) as ExtrasTopic[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={topics.includes(t)}
                    className={topics.includes(t) ? "choice chosen" : "choice"}
                    onClick={() => setTopics((all) => (all.includes(t) ? all.filter((x) => x !== t) : [...all, t]))}
                  >
                    {EXTRAS_TOPICS[t]}
                  </button>
                ))}
              </div>
              <div className="field field-options">
                <div className="field-head">
                  <label className="field-label" htmlFor="extras-ask">
                    Anything else? (optional)
                  </label>
                  <MicButton onSpeech={(heard) => setExtrasAsk((v) => joinTranscript(v, heard))} disabled={busy} />
                </div>
                <TextBox
                  id="extras-ask"
                  rows={2}
                  limit={EXTRAS_ASK_LIMIT}
                  value={extrasAsk}
                  placeholder="Snacks for the plane, what to bring for a toddler, a list for the water park day…"
                  onChange={setExtrasAsk}
                />
              </div>
              <div className="proposal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || (!topics.length && !extrasAsk.trim()) || extrasAsk.length > EXTRAS_ASK_LIMIT}
                  onClick={() => make("extras", { topics, ask: extrasAsk.trim() })}
                >
                  Make the extras
                </button>
              </div>
            </div>
          )}

          {chooser === "proposal" && (
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
                    come from your supplier and Travefy tools.
                  </p>
                  <button type="button" className="btn-quiet" disabled={busy} onClick={() => addToConversation(SUGGEST)}>
                    <IconSparkles size={14} aria-hidden /> Suggest options for me
                  </button>
                </>
              )}
              <div className="field field-options">
                <div className="field-head">
                  <label className="field-label" htmlFor="proposal-quotes">
                    {shape === "one" ? "The quote (optional)" : "My options and their quotes (optional)"}
                  </label>
                  <span className="field-tools">
                    <AttachButton attacher={quoteAttacher} disabled={busy} />
                    <MicButton onSpeech={(heard) => setQuotes((v) => joinTranscript(v, heard))} disabled={busy} />
                  </span>
                </div>
                <TextBox
                  id="proposal-quotes"
                  rows={3}
                  limit={MAX_MESSAGE}
                  value={quotes}
                  placeholder={
                    shape === "one"
                      ? "Paste screenshots of the supplier's quote (⌘V), drop them here, or type the prices"
                      : "Paste a screenshot of each option's quote (⌘V), or type them:\nPop Century, 7 nights $4,200\nPolynesian, 7 nights $9,800"
                  }
                  onChange={setQuotes}
                  onFiles={(files) => void quoteAttacher.attach(files)}
                />
                <AttachStatus attacher={quoteAttacher} />
                <p className="muted-note small">
                  I'll read each quote, list what's in the price (room, tickets, fees, discounts) and add it up for you. Anything I
                  can't find stays “Add price”.
                </p>
              </div>
              <div className="proposal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || quoteAttacher.reading !== null || quotes.length > MAX_MESSAGE}
                  onClick={() => make("proposal", { options: shape, ...(quotes.trim() ? { quotes: quotes.trim() } : {}) })}
                >
                  Make the proposal
                </button>
              </div>
            </div>
          )}

          {chooser === "email" && (
            <div className="proposal-panel">
              <p className="muted-note">
                I'll write the email in the trip chat, in your voice, with a private link to each document and the quote's totals.
                Sharing puts the newest version on each link for 30 days.
              </p>
              <div className="choices" role="group" aria-label="Which documents should the email link to?">
                {EMAIL_KINDS.filter((k) => latest[k]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={chosenKinds.includes(k)}
                    className={chosenKinds.includes(k) ? "choice chosen" : "choice"}
                    onClick={() => setEmailKinds(chosenKinds.includes(k) ? chosenKinds.filter((x) => x !== k) : [...chosenKinds, k])}
                  >
                    {DELIVERABLE_LABELS[k]} v{latest[k]!.version}
                  </button>
                ))}
              </div>
              <div className="field field-options">
                <div className="field-head">
                  <label className="field-label" htmlFor="email-ask">
                    Anything to mention? (optional)
                  </label>
                  <MicButton onSpeech={(heard) => setEmailAsk((v) => joinTranscript(v, heard))} disabled={busy} />
                </div>
                <TextBox
                  id="email-ask"
                  rows={2}
                  limit={EMAIL_ASK_LIMIT}
                  value={emailAsk}
                  placeholder="The deposit is due Friday, I'm free for a call this weekend…"
                  onChange={setEmailAsk}
                />
              </div>
              <div className="proposal-actions">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={busy || !chosenKinds.length || emailAsk.length > EMAIL_ASK_LIMIT}
                  onClick={() => void draftEmail()}
                >
                  <IconMail size={16} aria-hidden /> {drafting ? "Making the links…" : "Draft the email"}
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
