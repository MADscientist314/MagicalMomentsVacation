import { unzipSync, strFromU8 } from "fflate";
import { beforeEach, describe, expect, it } from "vitest";
import type { DeliverableMeta, DeliverableRecord } from "../shared/conversations";
import type { Itinerary } from "../shared/deliverables";
import { cleanFileName, formatBytes, MAX_FILE_BYTES, MAX_FILE_NAME, MAX_FILES_PER_TRIP, type TripFile } from "../shared/files";
import type { ImageMeta } from "../shared/images";
import { buildTripZip, dataUrl, safeName, uniqueName } from "../src/lib/tripZip";
import { sessionCookie } from "../worker/auth";
import { handleConversations } from "../worker/conversations";
import { disposition, fileType } from "../worker/files";
import worker from "../worker/index";
import * as store from "../worker/store";
import { fakeD1 } from "./helpers/fakeD1";
import { fakeR2 } from "./helpers/fakeR2";

const CTX = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
const PDF = new TextEncoder().encode("%PDF-1.7\n1 0 obj << >> endobj\n%%EOF");
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let env: Env;
let objects: Map<string, Uint8Array>;
beforeEach(() => {
  const r2 = fakeR2();
  objects = r2.objects;
  env = { ANTHROPIC_API_KEY: "k", APP_PASSWORD: "test-magic-words", DB: fakeD1(), IMAGES: r2.bucket } as Env;
});

async function newTrip(kind: "trip" | "chat" = "trip") {
  const c = await store.createConversation(
    env.DB,
    { kind, title: "Rivera family", details: kind === "trip" ? { lastName: "Rivera" } : {} },
    1,
  );
  return c.id;
}

function files(method: string, tripId: string, fileId?: string, init: RequestInit = {}, query = "") {
  const path = `/${tripId}/files${fileId ? `/${fileId}` : ""}`;
  const req = new Request(`https://app.test/api/conversations${path}${query}`, { method, ...init });
  return handleConversations(req, env, path.split("/").filter(Boolean), { now: () => 5_000 });
}

function upload(tripId: string, bytes: Uint8Array<ArrayBuffer>, name: string, type = "", headers: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([bytes], name, { type }));
  return files("POST", tripId, undefined, { body: form, headers });
}

async function added(tripId: string, bytes: Uint8Array<ArrayBuffer>, name: string, type = "") {
  const res = await upload(tripId, bytes, name, type);
  expect(res.status).toBe(201);
  return (await res.json()) as TripFile;
}

describe("file names and sizes", () => {
  it("keeps just the name, without folders or control characters", () => {
    expect(cleanFileName("C:\\Users\\Jill\\Desktop\\Hard Rock confirmation.pdf")).toBe("Hard Rock confirmation.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("Quote\u0000\n  final .pdf")).toBe("Quote final .pdf");
    expect(cleanFileName("...hidden")).toBe("hidden");
    expect(cleanFileName("   ")).toBe("file");
  });

  it("shortens a long name but keeps its extension", () => {
    const long = cleanFileName(`${"a".repeat(400)}.pdf`);
    expect(long).toHaveLength(MAX_FILE_NAME);
    expect(long.endsWith(".pdf")).toBe(true);
  });

  it("writes sizes the way people say them", () => {
    expect(formatBytes(900)).toBe("900 bytes");
    expect(formatBytes(850 * 1024)).toBe("850 KB");
    expect(formatBytes(2.4 * 1024 * 1024)).toBe("2.4 MB");
    expect(formatBytes(18 * 1024 * 1024)).toBe("18 MB");
  });
});

describe("what a file is kept as", () => {
  it("trusts the bytes for PDFs and photos, whatever the browser said", () => {
    expect(fileType(PDF, "")).toBe("application/pdf");
    expect(fileType(JPEG, "application/octet-stream")).toBe("image/jpeg");
  });

  it("never opens something in a tab just because its name or type says PDF", () => {
    expect(fileType(new TextEncoder().encode("<script>alert(1)</script>"), "application/pdf")).toBe("application/octet-stream");
  });

  it("keeps other types, except ones a browser could run as a page", () => {
    expect(fileType(new Uint8Array([0x50, 0x4b, 3, 4]), DOCX)).toBe(DOCX);
    expect(fileType(new TextEncoder().encode("hi"), "message/rfc822")).toBe("message/rfc822");
    for (const risky of ["text/html", "image/svg+xml", "application/xhtml+xml", "text/javascript", "application/xml"]) {
      expect(fileType(new TextEncoder().encode("<x/>"), risky)).toBe("application/octet-stream");
    }
    expect(fileType(new TextEncoder().encode("x"), "not a type")).toBe("application/octet-stream");
  });

  it("names the download in UTF-8, with a plain copy for older browsers", () => {
    expect(disposition("attachment", 'Itinéraire "v2" (final).pdf')).toBe(
      `attachment; filename="Itin_raire _v2_ (final).pdf"; filename*=UTF-8''Itin%C3%A9raire%20%22v2%22%20%28final%29.pdf`,
    );
  });
});

describe("trip files", () => {
  it("adds a file to the trip, lists it newest first, and keeps the bytes in R2", async () => {
    const id = await newTrip();
    const first = await added(id, PDF, "Supplier itinerary.pdf", "application/pdf");
    expect(first).toMatchObject({ name: "Supplier itinerary.pdf", mime: "application/pdf", bytes: PDF.length, created_at: 5_000 });
    expect(objects.get(`files/${id}/${first.id}`)).toEqual(PDF);
    const second = await added(id, new Uint8Array([0x50, 0x4b, 3, 4]), "Invoice.docx", DOCX);
    const list = (await (await files("GET", id)).json()) as TripFile[];
    expect(list.map((f) => f.id)).toEqual([second.id, first.id]);
  });

  it("opens a PDF in a tab, or downloads it on request, and keeps it out of the browser's cache", async () => {
    const id = await newTrip();
    const pdf = await added(id, PDF, "Hard Rock confirmation.pdf");
    const open = await files("GET", id, pdf.id);
    expect(open.status).toBe(200);
    expect(new Uint8Array(await open.arrayBuffer())).toEqual(PDF);
    expect(open.headers.get("content-type")).toBe("application/pdf");
    expect(open.headers.get("content-disposition")).toMatch(/^inline; filename="Hard Rock confirmation.pdf"/);
    expect(open.headers.get("x-content-type-options")).toBe("nosniff");
    expect(open.headers.get("cache-control")).toBe("private, no-store");
    expect(open.headers.get("content-security-policy")).toBeNull();
    const saved = await files("GET", id, pdf.id, {}, "?download");
    expect(saved.headers.get("content-disposition")).toMatch(/^attachment; /);
  });

  it("only ever downloads other files, sandboxed, even a web page", async () => {
    const id = await newTrip();
    const page = await added(id, new TextEncoder().encode("<script>alert(1)</script>"), "notes.html", "text/html");
    expect(page.mime).toBe("application/octet-stream");
    const res = await files("GET", id, page.id);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="notes.html"/);
    expect(res.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
  });

  it("deletes one file, bytes and all", async () => {
    const id = await newTrip();
    const f = await added(id, PDF, "old quote.pdf");
    expect((await files("DELETE", id, f.id)).status).toBe(200);
    expect(objects.has(`files/${id}/${f.id}`)).toBe(false);
    expect(await (await files("GET", id)).json()).toEqual([]);
    expect((await files("GET", id, f.id)).status).toBe(404);
  });

  it("keeps each trip's files to that trip", async () => {
    const mine = await newTrip();
    const other = await newTrip();
    const f = await added(mine, PDF, "Rivera.pdf");
    expect((await files("GET", other, f.id)).status).toBe(404);
    expect((await files("DELETE", other, f.id)).status).toBe(404);
    expect(objects.has(`files/${mine}/${f.id}`)).toBe(true);
  });

  it("turns away files over the limit, before reading them when it can, and empty ones", async () => {
    const id = await newTrip();
    const early = await upload(id, PDF, "huge.pdf", "", { "content-length": String(MAX_FILE_BYTES * 2) });
    expect(early.status).toBe(413);
    const big = await upload(id, new Uint8Array(MAX_FILE_BYTES + 1), "big.pdf");
    expect(big.status).toBe(413);
    expect(((await big.json()) as { error: string }).error).toBe("That file is too big. The limit is 25 MB.");
    expect((await upload(id, new Uint8Array(0), "empty.txt")).status).toBe(400);
    expect(objects.size).toBe(0);
  });

  it(`stops at ${MAX_FILES_PER_TRIP} files a trip`, async () => {
    const id = await newTrip();
    for (let i = 0; i < MAX_FILES_PER_TRIP; i++)
      await store.addTripFile(env.DB, id, { name: `${i}.pdf`, mime: "application/pdf", bytes: 1 }, i);
    const res = await upload(id, PDF, "one more.pdf");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/already has 200 files/);
  });

  it("is only for trips, not chats", async () => {
    const chat = await newTrip("chat");
    expect((await upload(chat, PDF, "x.pdf")).status).toBe(400);
  });

  it("goes with the trip when the trip is deleted", async () => {
    const id = await newTrip();
    const a = await added(id, PDF, "a.pdf");
    const b = await added(id, JPEG, "b.jpg");
    const req = new Request(`https://app.test/api/conversations/${id}`, { method: "DELETE" });
    expect((await handleConversations(req, env, [id])).status).toBe(200);
    expect(objects.has(`files/${id}/${a.id}`) || objects.has(`files/${id}/${b.id}`)).toBe(false);
    expect(await store.tripFileIds(env.DB, id)).toEqual([]);
  });

  it("needs the sign-in", async () => {
    const id = await newTrip();
    const f = await added(id, PDF, "a.pdf");
    const url = `https://app.test/api/conversations/${id}/files/${f.id}`;
    expect((await worker.fetch(new Request(url), env, CTX)).status).toBe(401);
    const cookie = (await sessionCookie(env)).split(";")[0];
    expect((await worker.fetch(new Request(url, { headers: { cookie } }), env, CTX)).status).toBe(200);
  });
});

describe("Download all", () => {
  const PLAN: Itinerary = {
    title: "The Rivera family's Disney week",
    intro: "Here's your plan.",
    coverPhoto: "11111111-1111-4111-8111-111111111111",
    days: [{ title: "Day 1", items: [{ time: null, text: "Check in and swim" }] }],
    tips: [],
    verifyNotes: ["Check the pool refurb dates"],
  };
  const meta = (id: string, kind: DeliverableMeta["kind"], version: number): DeliverableMeta => ({
    id,
    kind,
    version,
    created_at: version * 1000,
  });
  const record = (m: DeliverableMeta, data: unknown): DeliverableRecord => ({
    ...m,
    conversation_id: "t",
    data,
    footer: "Magical Moments Vacations",
    signature: "Jillian",
    share: null,
  });
  const picture = (id: string, kind: ImageMeta["kind"], created_at: number): ImageMeta => ({
    id,
    kind,
    shape: null,
    prompt: "",
    created_at,
  });
  const file = (id: string, name: string, created_at: number): TripFile => ({ id, name, mime: "application/pdf", bytes: 3, created_at });
  const jpeg = () => new Blob([JPEG], { type: "image/jpeg" });

  it("lays the trip out in folders: documents by kind, pictures, then her files", async () => {
    const docs = [meta("d2", "itinerary", 2), meta("d1", "itinerary", 1), meta("p1", "proposal", 1)];
    const records: Record<string, DeliverableRecord> = {
      d1: record(docs[1], PLAN),
      d2: record(docs[0], { ...PLAN, intro: "Updated plan." }),
      p1: record(docs[2], {
        title: "Options",
        intro: "One idea.",
        options: [{ name: "Hard Rock", summary: "Close to both parks", highlights: [], bestFor: "", price: { amount: null, note: "" } }],
        recommendation: "",
        nextSteps: [],
        verifyNotes: [],
      }),
    };
    const progress: [number, number][] = [];
    const zip = await buildTripZip(
      {
        folder: "Rivera family - Walt Disney World",
        stem: "Rivera-family",
        deliverables: docs,
        pictures: [picture("g2", "generated", 20), picture("u1", "upload", 10), picture("g1", "generated", 15)],
        files: [file("f2", "Quote.pdf", 2), file("f1", "Quote.pdf", 1), file("f3", 'Hard Rock: "final"?.pdf', 3)],
      },
      {
        getDeliverable: async (id) => records[id],
        fetchImage: async () => jpeg(),
        fetchFile: async (id) => new Blob([new TextEncoder().encode(`file ${id}`)]),
      },
      (done, total) => progress.push([done, total]),
    );
    expect(zip.skipped).toEqual([]);
    expect(zip.blob.type).toBe("application/zip");
    const entries = unzipSync(new Uint8Array(await zip.blob.arrayBuffer()));
    const root = "Rivera family - Walt Disney World";
    expect(Object.keys(entries)).toEqual([
      `${root}/Proposals/Rivera-family-proposal-v1.html`,
      `${root}/Itineraries/Rivera-family-itinerary-v1.html`,
      `${root}/Itineraries/Rivera-family-itinerary-v2.html`,
      `${root}/Pictures/Rivera-family-photo-1.jpg`,
      `${root}/Pictures/Rivera-family-picture-1.jpg`,
      `${root}/Pictures/Rivera-family-picture-2.jpg`,
      `${root}/Files/Quote.pdf`,
      `${root}/Files/Quote (2).pdf`,
      `${root}/Files/Hard Rock_ _final__.pdf`,
    ]);
    // The family's copy, with its picture inside, and none of Jillian's notes.
    const v1 = strFromU8(entries[`${root}/Itineraries/Rivera-family-itinerary-v1.html`]);
    expect(v1).toContain("Check in and swim");
    expect(v1).toContain("data:image/jpeg;base64,");
    expect(v1).not.toContain("pool refurb");
    expect(strFromU8(entries[`${root}/Itineraries/Rivera-family-itinerary-v2.html`])).toContain("Updated plan.");
    expect(strFromU8(entries[`${root}/Files/Quote.pdf`])).toBe("file f1");
    expect(entries[`${root}/Pictures/Rivera-family-photo-1.jpg`]).toEqual(JPEG);
    expect(progress.at(-1)).toEqual([9, 9]);
  });

  it("says what it couldn't add instead of failing the whole download", async () => {
    const zip = await buildTripZip(
      {
        folder: "Rivera family",
        stem: "Rivera-family",
        deliverables: [],
        pictures: [],
        files: [file("gone", "Deleted.pdf", 1), file("ok", "Kept.pdf", 2)],
      },
      {
        getDeliverable: async () => {
          throw new Error("unused");
        },
        fetchImage: async () => jpeg(),
        fetchFile: async (id) => {
          if (id === "gone") throw new Error("404");
          return new Blob(["ok"]);
        },
      },
    );
    expect(zip.skipped).toEqual(["Deleted.pdf"]);
    expect(Object.keys(unzipSync(new Uint8Array(await zip.blob.arrayBuffer())))).toEqual(["Rivera family/Files/Kept.pdf"]);
  });

  it("makes names every computer accepts, and keeps them apart", () => {
    expect(safeName('Rivera: "Disney" / 2027?')).toBe("Rivera_ _Disney_ _ 2027_");
    expect(safeName("trailing dots...")).toBe("trailing dots");
    const taken = new Set<string>();
    expect(["a.pdf", "A.pdf", "a.pdf", "notes"].map((n) => uniqueName(n, taken))).toEqual(["a.pdf", "A (2).pdf", "a (3).pdf", "notes"]);
  });

  it("turns a picture into a data: URL the documents accept", async () => {
    expect(await dataUrl(jpeg())).toBe(`data:image/jpeg;base64,${Buffer.from(JPEG).toString("base64")}`);
  });
});
