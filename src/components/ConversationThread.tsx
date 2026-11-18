import { useEffect, useRef, useState } from "react";
import { DOC_CHANGE } from "../../shared/conversations";
import { splitDraft, splitSubject } from "../../shared/sections";
import type { ChatState, ChatTurn } from "../lib/chatState";
import { renderMarkdown } from "../lib/markdown";
import { IconMail } from "@tabler/icons-react";
import { CopyButton, plainText } from "./CopyButton";
import { Sources } from "./Sources";
import { Sparkles } from "./Sparkles";

function Markdown({ md }: { md: string }) {
  return <div className="draft-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />;
}

const DAY_PLAN = /^###\s+Day\b/m;
const LONG = 1_500;

/**
 * Her message. An attached file shows as its name, with its text folded away; a long paste shows
 * its start, with the rest a click away.
 */
function UserBubble({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const at = text.indexOf("[Attached: ");
  if (at < 0 && text.length <= LONG) return <div className="bubble bubble-user">{text}</div>;
  const files = [...text.matchAll(/^\[Attached: (.+)\]$/gm)].map((m) => m[1]);
  const own = at < 0 ? `${text.slice(0, 600).trimEnd()}…` : text.slice(0, at).trim();
  return (
    <div className="bubble bubble-user">
      {open ? text : own}
      {!open && files.length > 0 && (
        <ul className="attached-files">
          {files.map((f, i) => (
            <li key={i}>📎 {f}</li>
          ))}
        </ul>
      )}
      <button type="button" className="bubble-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {open ? "Show less" : files.length ? "Show what was attached" : "Show all"}
      </button>
    </div>
  );
}

/** The email to the family ("Draft the email"): its subject and body to copy, or to open in her email app. */
function EmailReply({ turn, subject, body, internal, busy }: { turn: ChatTurn; subject: string; body: string; internal: string; busy: boolean }) {
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(plainText(body))}`;
  return (
    <div className="bubble bubble-assistant trip-reply email-reply">
      <div className="card-head">
        <span className="plan-label">✉️ Email to the family</span>
        {!busy && <CopyButton markdown={subject} label="Copy subject" />}
      </div>
      <p className="email-subject">
        <strong>Subject:</strong> {subject}
      </p>
      <Markdown md={body} />
      {internal && (
        <details className="notes-fold">
          <summary>For Jillian only</summary>
          <Markdown md={internal} />
        </details>
      )}
      {turn.sources && <Sources sources={turn.sources} />}
      {!busy && (
        <div className="bubble-actions">
          <CopyButton markdown={body} label="Copy email" />
          <a className="btn-quiet" href={mailto} title="Opens a new email in your email app, with this subject and text">
            <IconMail size={16} aria-hidden /> Open in my email
          </a>
        </div>
      )}
    </div>
  );
}

/** A trip reply: day blocks with Copy day, Jillian-only notes folded away, sources. */
function TripReply({ turn, current, busy }: { turn: ChatTurn; current: boolean; busy: boolean }) {
  const split = splitDraft(turn.content);
  const { client, internal } = split;
  // Only a day-by-day plan gets the plan label and Copy day; other ### replies (options, say) read as text.
  const blocks = DAY_PLAN.test(client) ? split.blocks : [];
  const email = blocks.length ? null : splitSubject(client);
  if (email?.subject) return <EmailReply turn={turn} subject={email.subject} body={email.body} internal={internal} busy={busy} />;
  return (
    <div className={`bubble bubble-assistant trip-reply${current ? " current" : ""}`}>
      {blocks.length > 0 && (
        <div className="card-head">
          <span className="plan-label">{current ? "✨ Current plan" : "Earlier plan"}</span>
          {!busy && <CopyButton markdown={client} label="Copy all days" />}
        </div>
      )}
      {blocks.length ? (
        <>
          {client.slice(0, client.indexOf("###")).trim() && <Markdown md={client.slice(0, client.indexOf("###"))} />}
          {blocks.map((b, i) => (
            <div key={i} className="day">
              <div className="card-head">
                <h3>{b.title}</h3>
                {!busy && <CopyButton markdown={`${b.title}\n\n${b.body}`} label="Copy day" />}
              </div>
              <Markdown md={b.body} />
            </div>
          ))}
        </>
      ) : (
        <Markdown md={client} />
      )}
      {internal && (
        <details className="notes-fold">
          <summary>For Jillian only</summary>
          <Markdown md={internal} />
        </details>
      )}
      {turn.sources && <Sources sources={turn.sources} />}
      {!busy && !blocks.length && (
        <div className="bubble-actions">
          <CopyButton markdown={client} />
        </div>
      )}
    </div>
  );
}

/** Within a screen's reach of the end of the page. */
function nearBottom(): boolean {
  const doc = document.documentElement;
  return doc.scrollHeight - (window.scrollY + window.innerHeight) < 240;
}

export function ConversationThread({ state, mode }: { state: ChatState; mode: "trip" | "chat" }) {
  const bottom = useRef<HTMLDivElement>(null);
  const busy = state.phase !== "idle";
  // The newest reply that contains a day-by-day plan is the one to copy into Travefy.
  const currentPlan = mode === "trip" ? state.turns.findLastIndex((t) => t.role === "assistant" && DAY_PLAN.test(t.content)) : -1;

  // Follow the conversation only when she's already at the bottom or has just sent something, so a reply
  // finishing never drags her away from what she's reading (John, Nov 17: "struggling with the scrolling").
  const shown = useRef(0);
  useEffect(() => {
    const before = shown.current;
    shown.current = state.turns.length;
    if (!state.turns.length) return;
    const opening = before === 0;
    const justSent = !opening && state.turns.length > before && state.turns[state.turns.length - 1].role === "user";
    if (opening ? mode === "chat" : justSent || nearBottom()) bottom.current?.scrollIntoView({ block: "end", behavior: opening ? "auto" : "smooth" });
  }, [state.turns, state.phase, mode]);

  return (
    <div className="thread" aria-live="polite">
      {state.turns.map((t, i) => {
        const last = i === state.turns.length - 1;
        // The short "Done" after a document change says nothing the note above it doesn't.
        if (t.role === "assistant" && i > 0 && state.turns[i - 1].role === "user" && state.turns[i - 1].content.startsWith(DOC_CHANGE)) return null;
        if (t.role === "user") {
          if (mode === "trip" && i === 0 && t.content.startsWith("**Client:**")) {
            return (
              <details key={i} className="trip-details-note">
                <summary>Trip details sent to the planner</summary>
                <Markdown md={t.content} />
              </details>
            );
          }
          // A change she made to a saved document from its panel: a quiet line, not a chat bubble.
          if (t.content.startsWith(DOC_CHANGE)) {
            const [what, ...rest] = t.content.slice(DOC_CHANGE.length).split("] ");
            return (
              <p key={i} className="doc-change-note">
                Changed {what}: {rest.join("] ")}
              </p>
            );
          }
          return <UserBubble key={i} text={t.content} />;
        }
        if (mode === "trip") return <TripReply key={i} turn={t} current={i === currentPlan} busy={busy && last} />;
        return (
          <div key={i} className="bubble bubble-assistant">
            <Markdown md={t.content} />
            {t.sources && <Sources sources={t.sources} />}
            {!(busy && last) && (
              <div className="bubble-actions">
                <CopyButton markdown={t.content} />
              </div>
            )}
          </div>
        );
      })}
      {(state.phase === "waiting" || state.phase === "searching") && (
        <div className="bubble bubble-assistant waiting-bubble">
          <Sparkles />
          <span>{state.phase === "searching" ? "Checking the latest info…" : "Sprinkling pixie dust…"}</span>
        </div>
      )}
      <div ref={bottom} />
    </div>
  );
}
