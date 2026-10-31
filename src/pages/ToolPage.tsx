import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { SAVES_DRAFTS, type SavedDraftMeta } from "../../shared/drafts";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../../shared/guard";
import { defaultShape } from "../../shared/images";
import type { DraftRequest, ToolDef } from "../../shared/tools";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { DraftPanel } from "../components/DraftPanel";
import { ImageStudio } from "../components/ImageStudio";
import { SavedDrafts } from "../components/SavedDrafts";
import { ToolForm } from "../components/ToolForm";
import { createDraft, getDraft, listDrafts, updateDraft } from "../lib/api";
import { fileStem } from "../lib/deliverableFiles";
import { draftReducer, initialDraftState } from "../lib/draftState";
import { maskedNotice } from "../lib/maskedNotice";
import { streamDraft } from "../lib/streamDraft";

export function ToolPage({ tool }: { tool: ToolDef }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [state, dispatch] = useReducer(draftReducer, initialDraftState);
  const controller = useRef<AbortController | null>(null);
  const saves = SAVES_DRAFTS(tool.id);
  const [saved, setSaved] = useState<SavedDraftMeta[]>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const lastSaved = useRef("");

  useEffect(() => () => controller.current?.abort(), []);

  const refreshSaved = useCallback(() => {
    if (saves) listDrafts(tool.id).then(setSaved).catch(() => {});
  }, [saves, tool.id]);

  useEffect(refreshSaved, [refreshSaved]);

  // Save each finished draft by name, and update the same saved draft after every refine.
  useEffect(() => {
    if (!saves || state.phase !== "done" || !state.receiving || state.error || !state.draft || !state.committed) return;
    if (lastSaved.current === state.draft) return;
    lastSaved.current = state.draft;
    const body = {
      request: { fields: state.committed.fields, refinements: state.committed.refinements },
      content: state.draft,
      sources: state.sources,
    };
    const work = savedId ? updateDraft(savedId, body) : createDraft(tool.id, body).then((d) => setSavedId(d.id));
    work.then(refreshSaved).catch(() => setNotice("Couldn't save this draft to your list — copy it before leaving the page."));
  }, [saves, state.phase, state.receiving, state.error, state.draft, state.committed, state.sources, savedId, tool.id, refreshSaved]);

  const open = async (id: string) => {
    try {
      const d = await getDraft(id);
      controller.current?.abort();
      setValues(d.request.fields);
      setFormError(null);
      setNotice(null);
      setSavedId(d.id);
      lastSaved.current = d.content;
      dispatch({ type: "load", draft: d.content, sources: d.sources, committed: { tool: tool.id, ...d.request } });
    } catch (e) {
      setFormError((e as Error).message);
    }
  };

  const forgetSaved = () => {
    setSavedId(null);
    lastSaved.current = "";
  };

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
    forgetSaved();
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
    forgetSaved();
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
        <div className="workspace-side">
          <ToolForm
            tool={tool}
            values={values}
            onChange={(id, value) => setValues((v) => ({ ...v, [id]: value }))}
            onSubmit={submit}
            busy={busy}
            error={formError}
            notice={notice}
          />
          <SavedDrafts
            tool={tool}
            drafts={saved}
            currentId={savedId}
            onOpen={(id) => void open(id)}
            onChanged={refreshSaved}
            onDeleted={(id) => {
              if (id === savedId) forgetSaved();
              refreshSaved();
            }}
            onError={setFormError}
          />
        </div>
        <div>
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
          {tool.id === "spread-the-magic" && savedId && state.phase === "done" && (
            <ImageStudio
              key={savedId}
              owner={{ type: "draft", id: savedId }}
              purpose="post"
              defaultShape={defaultShape(state.committed?.fields.channel)}
              fileStem={fileStem(saved.find((d) => d.id === savedId)?.title ?? "", "post")}
            />
          )}
        </div>
      </main>
    </>
  );
}
