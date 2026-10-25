import { useEffect, useRef } from "react";
import { splitDraft } from "../../shared/sections";
import type { ChatState, ChatTurn } from "../lib/chatState";
import { renderMarkdown } from "../lib/markdown";
import { CopyButton } from "./CopyButton";
import { Sources } from "./Sources";
import { Sparkles } from "./Sparkles";

function Markdown({ md }: { md: string }) {
  return <div className="draft-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />;
}

const DAY_PLAN = /^###\s+Day\b/m;

/** A trip reply: day blocks with Copy day, Jillian-only notes folded away, sources. */
function TripReply({ turn, current, busy }: { turn: ChatTurn; current: boolean; busy: boolean }) {
  const split = splitDraft(turn.content);
  const { client, internal } = split;
  // Only a day-by-day plan gets the plan label and Copy day; other ### replies (options, say) read as text.
  const blocks = DAY_PLAN.test(client) ? split.blocks : [];
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

export function ConversationThread({ state, mode }: { state: ChatState; mode: "trip" | "chat" }) {
  const bottom = useRef<HTMLDivElement>(null);
  const busy = state.phase !== "idle";
  // The newest reply that contains a day-by-day plan is the one to copy into Travefy.
  const currentPlan = mode === "trip" ? state.turns.findLastIndex((t) => t.role === "assistant" && DAY_PLAN.test(t.content)) : -1;

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [state.turns.length, state.phase]);

  return (
    <div className="thread" aria-live="polite">
      {state.turns.map((t, i) => {
        const last = i === state.turns.length - 1;
        if (t.role === "user") {
          if (mode === "trip" && i === 0 && t.content.startsWith("**Client:**")) {
            return (
              <details key={i} className="trip-details-note">
                <summary>Trip details sent to the planner</summary>
                <Markdown md={t.content} />
              </details>
            );
          }
          return (
            <div key={i} className="bubble bubble-user">
              {t.content}
            </div>
          );
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
