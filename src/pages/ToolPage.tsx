import { useEffect, useReducer, useRef, useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../../shared/guard";
import type { DraftRequest, ToolDef } from "../../shared/tools";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { DraftPanel } from "../components/DraftPanel";
import { ToolForm } from "../components/ToolForm";
import { draftReducer, initialDraftState } from "../lib/draftState";
import { maskedNotice } from "../lib/maskedNotice";
import { streamDraft } from "../lib/streamDraft";

export function ToolPage({ tool }: { tool: ToolDef }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, dispatch] = useReducer(draftReducer, initialDraftState);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = (body: DraftRequest) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    dispatch({ type: "start", body });
    void streamDraft(
      body,
      {
        text: (text) => dispatch({ type: "text", text }),
        status: (phase) => dispatch({ type: "status", phase }),
        done: (d) => dispatch({ type: "done", ...d }),
        error: (message) => dispatch({ type: "error", message }),
      },
      abort.signal,
    );
  };

  const submit = () => {
    const hits = findSensitive(Object.values(values).join("\n"));
    if (hits.length) {
      setFormError(SENSITIVE_MESSAGES[hits[0]]);
      return;
    }
    setFormError(null);
    let emails = 0;
    let phones = 0;
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries(values)) {
      const m = maskContacts(v);
      emails += m.emails;
      phones += m.phones;
      fields[k] = m.text;
    }
    setNotice(maskedNotice(emails, phones));
    run({ tool: tool.id, fields });
  };

  const refine = (request: string) => {
    const base = state.committed;
    if (!base) return;
    const hits = findSensitive(request);
    if (hits.length) {
      dispatch({ type: "error", message: SENSITIVE_MESSAGES[hits[0]] });
      return;
    }
    const refinements = [...(base.refinements ?? []), { draft: state.draft, request: maskContacts(request).text }];
    run({ ...base, refinements });
  };

  const startOver = () => {
    controller.current?.abort();
    dispatch({ type: "reset" });
  };

  const busy = state.phase === "waiting" || state.phase === "searching" || state.phase === "writing";

  return (
    <>
      <header className="hero">
        <CastleAtDusk />
        <div className="banner-text">
          <a className="back" href="#/">
            <IconArrowLeft size={16} aria-hidden />
            All tools
          </a>
          <h1>{tool.name}</h1>
        </div>
      </header>
      <main className="page workspace">
        <ToolForm
          tool={tool}
          values={values}
          onChange={(id, value) => setValues((v) => ({ ...v, [id]: value }))}
          onSubmit={submit}
          busy={busy}
          error={formError}
          notice={notice}
        />
        <DraftPanel
          tool={tool}
          draft={state.draft}
          phase={state.phase}
          sources={state.sources}
          stopReason={state.stopReason}
          error={state.error}
          receiving={state.receiving}
          onRefine={refine}
          onStartOver={startOver}
        />
      </main>
    </>
  );
}
