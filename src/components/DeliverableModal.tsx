import { useEffect, useMemo, useState } from "react";
import { IconDeviceFloppy, IconDownload, IconPrinter, IconX } from "@tabler/icons-react";
import type { DeliverableRecord } from "../../shared/conversations";
import { DELIVERABLE_LABELS, renderDeliverableHtml, validateDeliverable, type DeliverableData } from "../../shared/deliverables";
import { getDeliverable, saveDeliverableEdit } from "../lib/api";
import { downloadName, missingPrices } from "../lib/deliverableFiles";
import { DataEditor } from "./DataEditor";

interface Props {
  id: string;
  tripTitle: string;
  onClose(): void;
  /** Called after Jillian saves edits as a new version. */
  onSaved(): void;
}

type Pending = "html" | "print" | null;

export function DeliverableModal({ id, tripTitle, onClose, onSaved }: Props) {
  const [record, setRecord] = useState<DeliverableRecord | null>(null);
  const [data, setData] = useState<DeliverableData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"review" | "client">("review");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [currentId, setCurrentId] = useState(id);

  useEffect(() => {
    let live = true;
    getDeliverable(currentId)
      .then((r) => {
        if (!live) return;
        setRecord(r);
        setData(r.data as DeliverableData);
        setDirty(false);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [currentId]);

  const html = useMemo(
    () =>
      record && data
        ? {
            review: renderDeliverableHtml(record.kind, data, { footer: record.footer, signature: record.signature, mode: "review" }),
            client: renderDeliverableHtml(record.kind, data, { footer: record.footer, signature: record.signature, mode: "client" }),
          }
        : null,
    [record, data],
  );

  if (!record || !data || !html) {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal">{error ? <p className="message message-error">{error}</p> : <p>Opening…</p>}</div>
      </div>
    );
  }

  const missing = missingPrices(record.kind, data);

  const save = async () => {
    const checked = validateDeliverable(record.kind, data);
    if (!checked.ok) {
      setError("Something in that edit doesn't fit — check every field has a value.");
      return;
    }
    try {
      const saved = await saveDeliverableEdit(record.id, data);
      setError(null);
      setCurrentId(saved.id);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const downloadHtml = () => {
    const blob = new Blob([html.client], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = downloadName(tripTitle, record.kind, record.version);
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printPdf = () => {
    const w = window.open("", "_blank");
    if (!w) {
      setError("Your browser blocked the print window — allow pop-ups for this site and try again.");
      return;
    }
    w.document.write(html.client);
    w.document.close();
    // Give the fonts a moment, then open the print dialog ("Save as PDF").
    setTimeout(() => w.print(), 700);
  };

  const act = (what: Exclude<Pending, null>, force = false) => {
    if (missing.length && !force) return setPending(what);
    setPending(null);
    if (what === "html") downloadHtml();
    else printPdf();
  };

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={`${DELIVERABLE_LABELS[record.kind]} version ${record.version}`}>
      <div className="modal">
        <div className="modal-head">
          <h2>
            {DELIVERABLE_LABELS[record.kind]} · v{record.version}
            {dirty && <span className="unsaved"> · unsaved edits</span>}
          </h2>
          <div className="modal-actions">
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "review"} className={tab === "review" ? "active" : ""} onClick={() => setTab("review")}>
                Review &amp; edit
              </button>
              <button type="button" role="tab" aria-selected={tab === "client"} className={tab === "client" ? "active" : ""} onClick={() => setTab("client")}>
                Client copy
              </button>
            </div>
            {dirty && (
              <button type="button" className="btn-primary" onClick={() => void save()}>
                <IconDeviceFloppy size={16} aria-hidden /> Save as new version
              </button>
            )}
            <button type="button" className="btn-quiet" onClick={() => act("print")}>
              <IconPrinter size={16} aria-hidden /> PDF
            </button>
            <button type="button" className="btn-quiet" onClick={() => act("html")}>
              <IconDownload size={16} aria-hidden /> HTML
            </button>
            <button type="button" className="btn-quiet" aria-label="Close" onClick={onClose}>
              <IconX size={16} aria-hidden />
            </button>
          </div>
        </div>

        {error && <p className="message message-error">{error}</p>}
        {pending && (
          <div className="message message-warning" role="alert">
            Still says “Add price”: {missing.join(", ")}.{" "}
            <button type="button" className="btn-quiet" onClick={() => act(pending, true)}>
              {pending === "html" ? "Download anyway" : "Print anyway"}
            </button>{" "}
            <button type="button" className="btn-quiet" onClick={() => setPending(null)}>
              Keep editing
            </button>
          </div>
        )}
        {dirty && <p className="message message-info">The client copy downloads what you see here; save to keep it as a new version.</p>}

        {tab === "review" ? (
          <div className="modal-body review-layout">
            <div className="editor">
              <DataEditor
                value={data}
                onChange={(v) => {
                  setData(v as DeliverableData);
                  setDirty(true);
                }}
              />
            </div>
            <iframe title="Preview" className="doc-frame" sandbox="" srcDoc={html.review} />
          </div>
        ) : (
          <div className="modal-body">
            <iframe title="Client copy" className="doc-frame full" sandbox="" srcDoc={html.client} />
          </div>
        )}
      </div>
    </div>
  );
}
