import { useEffect, useRef, useState, type DragEvent } from "react";
import { IconDownload, IconFile, IconFileTypePdf, IconFileZip, IconMail, IconPhoto, IconUpload } from "@tabler/icons-react";
import type { DeliverableMeta } from "../../shared/conversations";
import { formatBytes, MAX_FILE_BYTES, MAX_FILES_PER_TRIP, VIEWABLE, type TripFile } from "../../shared/files";
import {
  deleteTripFile,
  fetchImage,
  fetchTripFile,
  getDeliverable,
  listImages,
  listTripFiles,
  tripFileUrl,
  uploadTripFile,
} from "../lib/api";
import { fileStem } from "../lib/deliverableFiles";
import { saveBlob } from "../lib/download";
import { buildTripZip } from "../lib/tripZip";
import { ConfirmDelete } from "./ConfirmDelete";

interface Props {
  tripId: string;
  tripTitle: string;
  destination?: string;
  /** The trip's saved documents (every version), for Download all. */
  deliverables: DeliverableMeta[];
}

const LIMIT_MB = MAX_FILE_BYTES / (1024 * 1024);
const when = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const hasFiles = (e: DragEvent) => [...e.dataTransfer.types].includes("Files");
/** "a.pdf", "a.pdf and b.pdf", "a.pdf, b.pdf and c.pdf". */
const names = (list: string[]) => (list.length < 2 ? list.join("") : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`);

function FileIcon({ file }: { file: TripFile }) {
  if (file.mime === "application/pdf") return <IconFileTypePdf size={18} aria-hidden />;
  if (file.mime.startsWith("image/")) return <IconPhoto size={18} aria-hidden />;
  if (file.mime === "message/rfc822" || /\.(eml|msg)$/i.test(file.name)) return <IconMail size={18} aria-hidden />;
  return <IconFile size={18} aria-hidden />;
}

/** The trip's own folder in the cloud: her files, and Download all for the whole trip. */
export function TripFiles({ tripId, tripTitle, destination, deliverables }: Props) {
  const [files, setFiles] = useState<TripFile[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [packing, setPacking] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    listTripFiles(tripId)
      .then((f) => live && setFiles(f))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [tripId]);

  const add = async (picked: File[]) => {
    if (!picked.length || adding) return;
    setError(null);
    setNote(null);
    const tooBig = picked.filter((f) => f.size > MAX_FILE_BYTES);
    const ok = picked.filter((f) => f.size <= MAX_FILE_BYTES);
    if ((files?.length ?? 0) + ok.length > MAX_FILES_PER_TRIP) {
      setError(`A trip can keep up to ${MAX_FILES_PER_TRIP} files. Delete some first.`);
      return;
    }
    const problems = tooBig.length
      ? [
          `${names(tooBig.map((f) => f.name))} ${tooBig.length === 1 ? "is" : "are"} over ${LIMIT_MB} MB, so ${tooBig.length === 1 ? "it wasn't" : "they weren't"} added.`,
        ]
      : [];
    for (const [i, file] of ok.entries()) {
      setAdding(ok.length > 1 ? `Adding ${i + 1} of ${ok.length}…` : `Adding ${file.name}…`);
      try {
        const saved = await uploadTripFile(tripId, file);
        setFiles((f) => [saved, ...(f ?? [])]);
      } catch (e) {
        problems.push(`${file.name}: ${(e as Error).message}`);
      }
    }
    setAdding(null);
    if (problems.length) setError(problems.join(" "));
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await deleteTripFile(tripId, id);
      setFiles((f) => (f ?? []).filter((x) => x.id !== id));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const downloadAll = async () => {
    if (packing) return;
    setError(null);
    setNote(null);
    setPacking("Getting everything together…");
    try {
      const pictures = await listImages({ type: "trip", id: tripId });
      if (!deliverables.length && !pictures.length && !files?.length) {
        setNote("Nothing to download yet. Documents, pictures and files you add will go in it.");
        return;
      }
      const folder = destination ? `${tripTitle} - ${destination}` : tripTitle;
      const zip = await buildTripZip(
        { folder, stem: fileStem(tripTitle, "trip"), deliverables, pictures, files: files ?? [] },
        { getDeliverable, fetchImage, fetchFile: (id) => fetchTripFile(tripId, id) },
        (done, total) => setPacking(`Packing ${Math.min(done + 1, total)} of ${total}…`),
      );
      saveBlob(zip.blob, `${fileStem(folder, "trip")}.zip`);
      if (zip.skipped.length) setNote(`Saved, but ${names(zip.skipped)} couldn't be added. Try again in a moment.`);
    } catch (e) {
      setError((e as Error).message || "Couldn't make the download — try again.");
    } finally {
      setPacking(null);
    }
  };

  return (
    <section
      className={`card trip-files${dragging ? " dragging" : ""}`}
      aria-label="Trip files"
      onDragOver={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setDragging(false);
        void add([...e.dataTransfer.files]);
      }}
    >
      <h2>Trip files</h2>
      <p className="muted-note">
        Keep supplier itineraries, confirmations, invoices and other paperwork for this trip here (but no card details or passport copies).
        Only people signed in can open them, and the assistant never reads them.
      </p>
      <div className="files-add">
        <button type="button" className="btn-quiet" disabled={adding !== null} onClick={() => picker.current?.click()}>
          <IconUpload size={16} aria-hidden /> Add files
        </button>
        <span className="muted-note" aria-live="polite">
          {adding ?? (
            <>
              <span className="drop-hint">or drop them here </span>(up to {LIMIT_MB} MB each)
            </>
          )}
        </span>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const picked = [...(e.target.files ?? [])];
            e.target.value = "";
            void add(picked);
          }}
        />
      </div>
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      {note && <p className="message message-info">{note}</p>}

      {files && files.length > 0 && (
        <ul className="file-list">
          {files.map((f) => {
            const view = VIEWABLE.has(f.mime);
            return (
              <li key={f.id} className="file-row">
                <a
                  className="file-link"
                  href={tripFileUrl(tripId, f.id, !view)}
                  {...(view ? { target: "_blank", rel: "noopener" } : { download: f.name })}
                >
                  <FileIcon file={f} />
                  <span className="file-name">{f.name}</span>
                </a>
                <span className="file-meta">
                  {formatBytes(f.bytes)} · {when(f.created_at)}
                </span>
                <span className="file-actions">
                  <a className="btn-icon" href={tripFileUrl(tripId, f.id, true)} download={f.name} aria-label={`Download ${f.name}`}>
                    <IconDownload size={15} aria-hidden />
                  </a>
                  <ConfirmDelete label={`Delete ${f.name}`} onDelete={() => void remove(f.id)} />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="files-foot">
        <button type="button" className="btn-quiet" disabled={packing !== null} onClick={() => void downloadAll()}>
          <IconFileZip size={16} aria-hidden /> {packing ?? "Download all"}
        </button>
        <p className="muted-note">One folder with the whole trip: its documents (every version), pictures and these files.</p>
      </div>
    </section>
  );
}
