import { useEffect, useMemo, useState } from "react";
import { IconDeviceFloppy, IconDownload, IconPrinter, IconX } from "@tabler/icons-react";
import type { DeliverableRecord } from "../../shared/conversations";
import {
  DELIVERABLE_LABELS,
  itineraryPhotoIds,
  renderDeliverableHtml,
  validateDeliverable,
  type DeliverableData,
  type Itinerary,
} from "../../shared/deliverables";
import { fetchImage, getDeliverable, saveDeliverableEdit } from "../lib/api";
import { downloadName, missingPrices } from "../lib/deliverableFiles";
import { saveBlob } from "../lib/download";
import { DataEditor } from "./DataEditor";
import { DocumentPictures } from "./DocumentPictures";

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

interface Props {
  id: string;
  tripId: string;
  tripTitle: string;
  onClose(): void;
  /** Called after Jillian saves edits as a new version. */
  onSaved(): void;
}

type Pending = "html" | "print" | null;

export function DeliverableModal({ id, tripId, tripTitle, onClose, onSaved }: Props) {
  const [record, setRecord] = useState<DeliverableRecord | null>(null);
  const [data, setData] = useState<DeliverableData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"review" | "client">("review");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [currentId, setCurrentId] = useState(id);
  const [closing, setClosing] = useState(false);
  // Pictures are put into the page as data: URLs, so the HTML file and the PDF carry them ("" while loading).
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const photoIds = record?.kind === "itinerary" && data ? itineraryPhotoIds(data as Itinerary) : [];

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

  useEffect(() => {
    for (const photoId of photoIds) {
      if (photos[photoId] !== undefined) continue;
      setPhotos((p) => ({ ...p, [photoId]: p[photoId] ?? "" }));
      fetchImage(photoId)
        .then(toDataUrl)
        .then((url) => setPhotos((p) => ({ ...p, [photoId]: url })))
        // A picture that can't load (deleted, offline) is left out rather than holding up the PDF.
        .catch(() => setPhotos((p) => ({ ...p, [photoId]: "unavailable" })));
    }
  }, [photoIds.join(",")]);

  const html = useMemo(
    () =>
      record && data
        ? {
            review: renderDeliverableHtml(record.kind, data, { footer: record.footer, signature: record.signature, mode: "review", photos }),
            client: renderDeliverableHtml(record.kind, data, { footer: record.footer, signature: record.signature, mode: "client", photos }),
          }
        : null,
    [record, data, photos],
  );

  if (!record || !data || !html) {
    return (
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal">{error ? <p className="message message-error">{error}</p> : <p>Opening…</p>}</div>
      </div>
    );
  }

  const missing = missingPrices(record.kind, data);
  const picturesLoading = photoIds.some((photoId) => !photos[photoId]);

  /** Saves the edits as a new version; true when saved. */
  const save = async (): Promise<boolean> => {
    const checked = validateDeliverable(record.kind, data);
    if (!checked.ok) {
      setError("Something in that edit doesn't fit — check every field has a value.");
      return false;
    }
    try {
      const saved = await saveDeliverableEdit(record.id, data);
      setError(null);
      setCurrentId(saved.id);
      onSaved();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    }
  };

  const close = () => (dirty ? setClosing(true) : onClose());

  const downloadHtml = () =>
    saveBlob(new Blob([html.client], { type: "text/html" }), downloadName(tripTitle, record.kind, record.version));

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
    // Download or print right away (browsers only allow it straight after the click), and keep the
    // edits by saving them as a new version at the same time.
    if (what === "html") downloadHtml();
    else printPdf();
    if (dirty) void save();
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
            <button type="button" className="btn-quiet" disabled={picturesLoading} title={picturesLoading ? "Loading pictures…" : undefined} onClick={() => act("print")}>
              <IconPrinter size={16} aria-hidden /> PDF
            </button>
            <button type="button" className="btn-quiet" disabled={picturesLoading} title={picturesLoading ? "Loading pictures…" : undefined} onClick={() => act("html")}>
              <IconDownload size={16} aria-hidden /> HTML
            </button>
            <button type="button" className="btn-quiet" aria-label="Close" onClick={close}>
              <IconX size={16} aria-hidden />
            </button>
          </div>
        </div>

        {error && <p className="message message-error">{error}</p>}
        {closing && (
          <div className="message message-warning" role="alert">
            You have edits that aren't saved yet.{" "}
            <button type="button" className="btn-quiet" onClick={() => void save().then((ok) => ok && onClose())}>
              Save and close
            </button>{" "}
            <button type="button" className="btn-quiet" onClick={onClose}>
              Close without saving
            </button>{" "}
            <button type="button" className="btn-quiet" onClick={() => setClosing(false)}>
              Keep editing
            </button>
          </div>
        )}
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
        {dirty && !closing && (
          <p className="message message-info">Unsaved edits. PDF and HTML download what you see here and save it as a new version.</p>
        )}

        {tab === "review" ? (
          <div className="modal-body review-layout">
            <div className="editor">
              {record.kind === "itinerary" && (
                <DocumentPictures
                  tripId={tripId}
                  deliverableId={record.id}
                  savedDays={(record.data as Itinerary).days.length}
                  plan={data as Itinerary}
                  onChange={(update) => {
                    setData((d) => update(d as Itinerary));
                    setDirty(true);
                  }}
                />
              )}
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
