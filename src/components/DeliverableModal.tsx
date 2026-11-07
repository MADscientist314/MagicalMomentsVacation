import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { IconDeviceFloppy, IconDownload, IconLink, IconPrinter, IconX } from "@tabler/icons-react";
import type { DeliverableRecord } from "../../shared/conversations";
import {
  DELIVERABLE_LABELS,
  documentPhotoIds,
  HAS_PICTURES,
  renderDeliverableHtml,
  tidyDeliverable,
  validateDeliverable,
  type DeliverableData,
  type Itinerary,
  type Proposal,
} from "../../shared/deliverables";
import type { ShareInfo } from "../../shared/shares";
import { fetchImage, getDeliverable, saveDeliverableEdit, shareDeliverable, stopSharing } from "../lib/api";
import { copyText } from "../lib/clipboard";
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

type Pending = "html" | "print" | "share" | null;

const day = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function DeliverableModal({ id, tripId, tripTitle, onClose, onSaved }: Props) {
  const [record, setRecord] = useState<DeliverableRecord | null>(null);
  const [data, setData] = useState<DeliverableData | null>(null);
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"review" | "client">("review");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [currentId, setCurrentId] = useState(id);
  const [closing, setClosing] = useState(false);
  const [share, setShare] = useState<ShareInfo | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stopping, setStopping] = useState(false);
  // Pictures are put into the page as data: URLs, so the HTML file and the PDF carry them ("" while loading).
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const photoIds = record && data ? documentPhotoIds(record.kind, data) : [];

  useEffect(() => {
    let live = true;
    getDeliverable(currentId)
      .then((r) => {
        if (!live) return;
        setRecord(r);
        setData(r.data as DeliverableData);
        setDirty(false);
        setShare(r.share);
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
    return createPortal(
      <div className="modal-backdrop" role="dialog" aria-modal="true">
        <div className="modal">{error ? <p className="message message-error">{error}</p> : <p>Opening…</p>}</div>
      </div>,
      document.body,
    );
  }

  const missing = missingPrices(record.kind, data);
  const picturesLoading = photoIds.some((photoId) => !photos[photoId]);

  /** Saves the edits as a new version; its id when saved, otherwise null. */
  const save = async (): Promise<string | null> => {
    // Empty rows (a removed option's leftovers, a blank activity) are dropped rather than refused.
    const checked = validateDeliverable(record.kind, tidyDeliverable(record.kind, data));
    if (!checked.ok) {
      setError(checked.error);
      return null;
    }
    try {
      const saved = await saveDeliverableEdit(record.id, checked.data);
      setError(null);
      setCurrentId(saved.id);
      onSaved();
      return saved.id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    }
  };

  const linkFor = (s: ShareInfo) => `${window.location.origin}${s.path}`;
  const copyLink = async (s: ShareInfo) => {
    await copyText(linkFor(s));
    setCopied(true);
    setTimeout(() => setCopied(false), 2_500);
  };

  /** Puts this version (saved first, if edited) on the family's link, and copies the link. */
  const shareNow = async () => {
    setSharing(true);
    setStopping(false);
    try {
      const id = dirty ? await save() : record.id;
      if (!id) return;
      const s = await shareDeliverable(id);
      setShare(s);
      await copyLink(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSharing(false);
    }
  };

  const stopNow = async () => {
    try {
      await stopSharing(record.id);
      setShare(null);
      setStopping(false);
    } catch (e) {
      setError((e as Error).message);
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
    if (what === "share") return void shareNow();
    // Download or print right away (browsers only allow it straight after the click), and keep the
    // edits by saving them as a new version at the same time.
    if (what === "html") downloadHtml();
    else printPdf();
    if (dirty) void save();
  };

  // On the body, so it covers the whole page: the trip's side column (where it's opened) is its own layer.
  return createPortal(
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
            <button
              type="button"
              className="btn-quiet"
              disabled={sharing}
              title="A private web page for the family, for 30 days"
              onClick={() => (share?.deliverableId === record.id && !dirty ? void copyLink(share) : act("share"))}
            >
              <IconLink size={16} aria-hidden /> {sharing ? "Sharing…" : share?.deliverableId === record.id && !dirty ? (copied ? "Copied" : "Copy link") : "Share link"}
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
            <button type="button" className="btn-quiet" onClick={() => void save().then((id) => id && onClose())}>
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
              {pending === "html" ? "Download anyway" : pending === "share" ? "Share anyway" : "Print anyway"}
            </button>{" "}
            <button type="button" className="btn-quiet" onClick={() => setPending(null)}>
              Keep editing
            </button>
          </div>
        )}
        {dirty && !closing && (
          <p className="message message-info">
            Unsaved edits. PDF and HTML download what you see here and save it as a new version{share ? "; Share link saves it and moves the link to it" : ""}.
          </p>
        )}
        {share && (
          <div className="message message-info share-strip">
            <IconLink size={16} aria-hidden />
            <span>
              {share.deliverableId === record.id ? "The family's link shows this version" : `The family's link shows version ${share.version}`} until{" "}
              {day(share.expiresAt)}. Anyone with the link can open it.
            </span>
            <input className="share-url" readOnly value={linkFor(share)} aria-label="The family's link" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn-quiet" onClick={() => void copyLink(share)}>
              {copied ? "Copied" : "Copy link"}
            </button>
            <a className="btn-quiet" href={linkFor(share)} target="_blank" rel="noreferrer">
              Open
            </a>
            {share.deliverableId !== record.id && (
              <button type="button" className="btn-quiet" disabled={sharing} onClick={() => act("share")}>
                Show v{record.version} on the link instead
              </button>
            )}
            {stopping ? (
              <span className="confirm">
                The link will stop working.
                <button type="button" className="btn-quiet danger" onClick={() => void stopNow()}>
                  Stop sharing
                </button>
                <button type="button" className="btn-quiet" onClick={() => setStopping(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className="btn-quiet" onClick={() => setStopping(true)}>
                Stop sharing
              </button>
            )}
          </div>
        )}

        {tab === "review" ? (
          <div className="modal-body review-layout">
            <div className="editor">
              {HAS_PICTURES(record.kind) && (
                <DocumentPictures
                  tripId={tripId}
                  kind={record.kind as "itinerary" | "proposal"}
                  deliverableId={record.id}
                  savedCount={
                    record.kind === "itinerary" ? (record.data as Itinerary).days.length : (record.data as Proposal).options.length
                  }
                  doc={data as Itinerary | Proposal}
                  onChange={(update) => {
                    setData((d) => update(d as Itinerary | Proposal));
                    setDirty(true);
                  }}
                />
              )}
              <DataEditor
                value={data}
                onChange={(v) => {
                  setData(v as DeliverableData);
                  setDirty(true);
                  setError(null);
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
    </div>,
    document.body,
  );
}
