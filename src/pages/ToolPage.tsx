import { useEffect, useRef, useState } from "react";
import { IconArrowLeft } from "@tabler/icons-react";
import { findSensitive, maskContacts, SENSITIVE_MESSAGES } from "../../shared/guard";
import type { DraftRequest, ToolDef } from "../../shared/tools";
import { CastleAtDusk } from "../art/CastleAtDusk";
import { DraftPanel, type Phase } from "../components/DraftPanel";
import { ToolForm } from "../components/ToolForm";
import { streamDraft } from "../lib/streamDraft";

function maskedNotice(emails: number, phones: number): string | null {
  const parts = [];
  if (emails) parts.push(`${emails} email${emails > 1 ? "s" : ""}`);
  if (phones) parts.push(`${phones} phone number${phones > 1 ? "s" : ""}`);
  return parts.length ? `Hid ${parts.join(" and ")} — they aren't needed for the draft.` : null;
}

export function ToolPage({ tool }: { tool: ToolDef }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [stopReason, setStopReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<DraftRequest | null>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const run = (body: DraftRequest) => {
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setSent(body);
    setDraft("");
    setSources([]);
    setStopReason(null);
    setError(null);
    setPhase("waiting");
    void streamDraft(
      body,
      {
        text: (t) => {
          setPhase("writing");
          setDraft((d) => d + t);
        },
        status: (p) => setPhase(p),
        done: (d) => {
          setSources(d.sources);
          setStopReason(d.stopReason);
          setPhase("done");
        },
        error: (message) => {
          setError(message);
          setPhase("done");
        },
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
    if (!sent) return;
    const hits = findSensitive(request);
    if (hits.length) {
      setError(SENSITIVE_MESSAGES[hits[0]]);
      return;
    }
    const refinements = [...(sent.refinements ?? []), { draft, request: maskContacts(request).text }];
    run({ ...sent, refinements });
  };

  const startOver = () => {
    controller.current?.abort();
    setSent(null);
    setDraft("");
    setSources([]);
    setStopReason(null);
    setError(null);
    setPhase("idle");
  };

  const busy = phase === "waiting" || phase === "searching" || phase === "writing";

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
          draft={draft}
          phase={phase}
          sources={sources}
          stopReason={stopReason}
          error={error}
          onRefine={refine}
          onStartOver={startOver}
        />
      </main>
    </>
  );
}
