// Download all: the whole trip as one folder in a zip, laid out the way Jillian files a client by hand.
// Each kind of document gets its own folder (every version, as the family sees it, as a web page that
// opens in any browser and prints to PDF), then the trip's photos and pictures, then her files.
import { strToU8, Zip, ZipDeflate, ZipPassThrough } from "fflate";
import type { DeliverableMeta, DeliverableRecord } from "../../shared/conversations";
import {
  DELIVERABLE_KINDS,
  DELIVERABLE_LABELS,
  documentPhotoIds,
  renderDeliverableHtml,
  type DeliverableData,
  type DeliverableKind,
} from "../../shared/deliverables";
import type { TripFile } from "../../shared/files";
import type { ImageMeta } from "../../shared/images";

export const DOCUMENT_FOLDERS: Record<DeliverableKind, string> = {
  proposal: "Proposals",
  itinerary: "Itineraries",
  estimate: "Estimates",
  extras: "Extras",
};

const PICTURE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
const ZIP_FIRST_DAY = Date.UTC(1980, 0, 2);
const ZIP_LAST_DAY = Date.UTC(2099, 11, 31);

export interface TripZipSources {
  getDeliverable(id: string): Promise<DeliverableRecord>;
  fetchImage(id: string): Promise<Blob>;
  fetchFile(id: string): Promise<Blob>;
}

export interface TripZipInput {
  /** The top folder, such as "Rivera family - Walt Disney World". */
  folder: string;
  /** Starts the document and picture names, such as "Rivera-family". */
  stem: string;
  deliverables: DeliverableMeta[];
  pictures: ImageMeta[];
  files: TripFile[];
}

export interface TripZip {
  blob: Blob;
  /** What couldn't be added (deleted meanwhile, or the connection dropped). */
  skipped: string[];
}

/** A name Windows and Macs both accept for a file or folder. */
export function safeName(name: string): string {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/[. ]+$/, "")
      .trim() || "file"
  );
}

/** Keeps names in one folder apart, "Quote.pdf" then "Quote (2).pdf", ignoring case as Windows and Macs do. */
export function uniqueName(name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  let candidate = name;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base} (${n})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** A data: URL made without FileReader, so the same code runs in tests. */
export async function dataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(binary)}`;
}

async function documentHtml(id: string, sources: TripZipSources): Promise<string> {
  const record = await sources.getDeliverable(id);
  const data = record.data as DeliverableData;
  const photos: Record<string, string> = {};
  for (const photoId of documentPhotoIds(record.kind, data)) {
    // A picture that can't load is left out of the page, as it is in the document window.
    photos[photoId] = await sources.fetchImage(photoId).then(dataUrl, () => "unavailable");
  }
  return renderDeliverableHtml(record.kind, data, { footer: record.footer, signature: record.signature, mode: "client", photos });
}

const bytesOf = async (blob: Blob) => new Uint8Array(await blob.arrayBuffer());

interface Entry {
  label: string;
  compress: boolean;
  mtime: number;
  /** The bytes, and the path once they're known (a picture's extension comes from its type). */
  load(): Promise<{ path: string; bytes: Uint8Array }>;
}

function entriesFor(input: TripZipInput, sources: TripZipSources): Entry[] {
  const root = safeName(input.folder);
  const entries: Entry[] = [];

  const docs = [...input.deliverables].sort(
    (a, b) => DELIVERABLE_KINDS.indexOf(a.kind) - DELIVERABLE_KINDS.indexOf(b.kind) || a.version - b.version,
  );
  for (const d of docs) {
    entries.push({
      label: `${DELIVERABLE_LABELS[d.kind]} v${d.version}`,
      compress: true,
      mtime: d.created_at,
      load: async () => ({
        path: `${root}/${DOCUMENT_FOLDERS[d.kind]}/${input.stem}-${d.kind}-v${d.version}.html`,
        bytes: strToU8(await documentHtml(d.id, sources)),
      }),
    });
  }

  // Oldest first, so the numbers stay put as more are added. The family's photos and made pictures count apart.
  const count = { photo: 0, picture: 0 };
  for (const p of [...input.pictures].sort((a, b) => a.created_at - b.created_at)) {
    const word = p.kind === "upload" ? "photo" : "picture";
    const n = ++count[word];
    entries.push({
      label: `${word} ${n}`,
      compress: false,
      mtime: p.created_at,
      load: async () => {
        const blob = await sources.fetchImage(p.id);
        return { path: `${root}/Pictures/${input.stem}-${word}-${n}.${PICTURE_TYPES[blob.type] ?? "jpg"}`, bytes: await bytesOf(blob) };
      },
    });
  }

  const taken = new Set<string>();
  for (const f of [...input.files].sort((a, b) => a.created_at - b.created_at)) {
    const name = uniqueName(safeName(f.name), taken);
    entries.push({
      label: f.name,
      // PDFs, photos and Office files are compressed already.
      compress: false,
      mtime: f.created_at,
      load: async () => ({ path: `${root}/Files/${name}`, bytes: await bytesOf(await sources.fetchFile(f.id)) }),
    });
  }
  return entries;
}

/** Everything in the trip, one item at a time so a big trip never sits in memory twice. */
export async function buildTripZip(
  input: TripZipInput,
  sources: TripZipSources,
  progress?: (done: number, total: number) => void,
): Promise<TripZip> {
  const entries = entriesFor(input, sources);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let finish!: (blob: Blob) => void;
  let fail!: (err: unknown) => void;
  const finished = new Promise<Blob>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const zip = new Zip((err, chunk, final) => {
    if (err) return fail(err);
    chunks.push(chunk as Uint8Array<ArrayBuffer>);
    if (final) finish(new Blob(chunks, { type: "application/zip" }));
  });

  const skipped: string[] = [];
  for (const [i, entry] of entries.entries()) {
    progress?.(i, entries.length);
    let loaded: { path: string; bytes: Uint8Array };
    try {
      loaded = await entry.load();
    } catch {
      skipped.push(entry.label);
      continue;
    }
    const file = entry.compress ? new ZipDeflate(loaded.path, { level: 6 }) : new ZipPassThrough(loaded.path);
    // Zip dates only run from 1980 to 2099; outside that the entry keeps today's date.
    if (entry.mtime >= ZIP_FIRST_DAY && entry.mtime < ZIP_LAST_DAY) file.mtime = entry.mtime;
    zip.add(file);
    file.push(loaded.bytes, true);
  }
  zip.end();
  const blob = await finished;
  progress?.(entries.length, entries.length);
  return { blob, skipped };
}
