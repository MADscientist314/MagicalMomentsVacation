import { useState, type ReactNode } from "react";
import { IconMap2, IconRefresh } from "@tabler/icons-react";
import type { ToolDef } from "../../shared/tools";
import type { Phase } from "../lib/draftState";
import { parseTripHandoff, splitDraft, splitSubject } from "../../shared/sections";
import { giveHandoff } from "../lib/handoff";
import { renderMarkdown } from "../lib/markdown";
import { CopyButton } from "./CopyButton";
import { Sources } from "./Sources";
import { Sparkles } from "./Sparkles";


interface Props {
  tool: ToolDef;
  draft: string;
  phase: Phase;
  sources: { title: string; url: string }[];
  stopReason: string | null;
  error: string | null;
  /** The draft on screen belongs to the request in flight (vs. the previous one). */
  receiving: boolean;
  onRefine(request: string): void;
  onStartOver(): void;
}

function Markdown({ md }: { md: string }) {
  return <div className="draft-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(md) }} />;
}

const STOP_NOTES: Record<string, string> = {
  refusal: "I can't help with that one — try rewording.",
  max_tokens: "That got long — try asking for less.",
};

export function DraftPanel({ tool, draft, phase, sources, stopReason, error, receiving, onRefine, onStartOver }: Props) {
  const [request, setRequest] = useState("");
  const busy = phase === "waiting" || phase === "searching" || phase === "writing";
  const { client, internal, blocks } = splitDraft(draft);
  const blockLabel = tool.id === "inbox-helper" ? "Copy reply" : "Copy day";
  const { subject, body } = splitSubject(client);

  if (phase === "idle" && !error) {
    return (
      <section className="card empty" aria-live="polite">
        Fill in the form and choose <strong>Draft it</strong>. Your draft will appear here for you to review.
      </section>
    );
  }

  const waiting = (phase === "waiting" || phase === "searching") && !receiving && (
    <div className="waiting" aria-live="polite">
      <Sparkles />
      <p>{phase === "searching" ? "Checking the latest info…" : "Sprinkling pixie dust…"}</p>
    </div>
  );

  const clientCard: ReactNode = client && (
    <section className="card" aria-live="polite">
      <div className="card-head">
        <h2>{blocks.length ? (tool.id === "inbox-helper" ? "Replies" : "Trip plan") : "Draft"}</h2>
        {!busy && !(blocks.length && tool.id === "inbox-helper") && (
          <CopyButton markdown={blocks.length ? client : body} label={blocks.length ? "Copy all days" : "Copy"} />
        )}
      </div>
      {subject && (
        <div className="subject">
          <span>
            <strong>Subject:</strong> {subject}
          </span>
          {!busy && <CopyButton markdown={subject} label="Copy subject" />}
        </div>
      )}
      {blocks.length ? (
        blocks.map((d) => (
          <div key={d.title} className="day">
            <div className="card-head">
              <h3>{d.title}</h3>
              {!busy && <CopyButton markdown={`${d.title}\n\n${d.body}`} label={blockLabel} />}
            </div>
            <Markdown md={d.body} />
          </div>
        ))
      ) : (
        <Markdown md={body} />
      )}
    </section>
  );

  const handoff = tool.id === "welcome-center" && phase === "done" ? parseTripHandoff(internal) : null;

  const notesCard: ReactNode = (internal || sources.length > 0) && (
    <section className="card notes">
      <div className="card-head">
        <h2>For Jillian only</h2>
        {handoff && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              giveHandoff(handoff);
              window.location.hash = "#/trips/new";
            }}
          >
            <IconMap2 size={16} aria-hidden /> Start a trip
          </button>
        )}
      </div>
      <Markdown md={internal} />
      <Sources sources={sources} />
    </section>
  );

  return (
    <div>
      {waiting}
      {tool.notesFirst ? notesCard : clientCard}
      {tool.notesFirst ? clientCard : notesCard}
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      {stopReason && STOP_NOTES[stopReason] && <p className="message message-info">{STOP_NOTES[stopReason]}</p>}
      {phase === "done" && draft && (
        <form
          className="refine"
          onSubmit={(e) => {
            e.preventDefault();
            if (request.trim()) {
              onRefine(request.trim());
              setRequest("");
            }
          }}
        >
          <label htmlFor="refine" className="sr-only">
            How should I change it?
          </label>
          <input
            id="refine"
            value={request}
            maxLength={2000}
            placeholder="Make it shorter, warmer, add the dining time…"
            onChange={(e) => setRequest(e.target.value)}
          />
          <button type="submit" className="btn-primary">
            Refine
          </button>
        </form>
      )}
      {(draft || error || busy) && (
        <div className="actions">
          <button type="button" className="btn-quiet" onClick={onStartOver}>
            <IconRefresh size={16} aria-hidden />
            Start over
          </button>
        </div>
      )}
    </div>
  );
}
