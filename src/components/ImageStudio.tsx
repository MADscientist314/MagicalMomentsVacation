import { useEffect, useRef, useState } from "react";
import { IconDownload, IconPencil, IconPhotoPlus, IconSparkles, IconTrash, IconX } from "@tabler/icons-react";
import { CARD_KINDS, MAX_REFERENCE_PHOTOS, ownerKey, SHAPES, type CardKind, type ImageMeta, type ImageOwner, type Shape } from "../../shared/images";
import { deleteImage, fetchImage, generateImage, imageUrl, listImages, uploadImage } from "../lib/api";
import { saveBlob } from "../lib/download";
import { shrinkPhoto } from "../lib/photos";
import { Sparkles } from "./Sparkles";

interface Props {
  owner: ImageOwner;
  /** Posts get an image to go with them, trips get cards for the family, and Picture Perfect makes anything. */
  purpose: "post" | "card" | "free";
  defaultShape: Shape;
  /** Start of the downloaded file's name, e.g. "Whitfield-family". */
  fileStem: string;
}

function Choices<T extends string>({ label, options, value, onChange }: { label: string; options: Record<T, string>; value: T; onChange(v: T): void }) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="choices" role="radiogroup" aria-label={label}>
        {(Object.keys(options) as T[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={k === value} className={k === value ? "choice chosen" : "choice"} onClick={() => onChange(k)}>
            {options[k]}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ConfirmDelete({ label, onDelete }: { label: string; onDelete(): void }) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="confirm">
      Delete?
      <button type="button" className="btn-quiet danger" onClick={onDelete}>
        Delete
      </button>
      <button type="button" className="btn-quiet" onClick={() => setConfirming(false)}>
        Keep
      </button>
    </span>
  ) : (
    <button type="button" className="btn-icon" aria-label={label} onClick={() => setConfirming(true)}>
      <IconTrash size={15} aria-hidden />
    </button>
  );
}

const SHAPE_LABELS = Object.fromEntries(Object.entries(SHAPES).map(([k, s]) => [k, s.label])) as Record<Shape, string>;

const TEXT: Record<Props["purpose"], { heading: string; about: string; placeholder: string }> = {
  post: {
    heading: "Images for this post",
    about: "An image to go with this post, made from what it says.",
    placeholder: "Our family photo by the pool at sunset, with the words 'Book by Dec 1'",
  },
  card: {
    heading: "Cards for the family",
    about: "A countdown, birthday, bon voyage or welcome-home card made from this trip.",
    placeholder: "30 days to go! Use our photo and add confetti",
  },
  free: {
    heading: "Make an image",
    about: "Anything for your business: a social graphic, a flyer, a promo, a holiday greeting. Describe it, and add your own photos if you like.",
    placeholder: "A flyer: a sunny beach at sunrise, with the words 'Now booking 2027'",
  },
};

/** Make images with Nano Banana from the post or trip, her words and her own photos; download them for Canva. */
export function ImageStudio({ owner, purpose, defaultShape, fileStem }: Props) {
  const [images, setImages] = useState<ImageMeta[]>([]);
  const [shape, setShape] = useState<Shape>(defaultShape);
  const [card, setCard] = useState<CardKind>("countdown");
  const [direction, setDirection] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [working, setWorking] = useState<"making" | "adding" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const directionBox = useRef<HTMLTextAreaElement>(null);
  const key = ownerKey(owner);
  const text = TEXT[purpose];

  useEffect(() => {
    listImages(owner)
      .then(setImages)
      .catch((e: Error) => setError(e.message));
  }, [key]);

  const photos = images.filter((i) => i.kind === "upload");
  const made = images.filter((i) => i.kind === "generated");
  const fail = (e: Error) => setError(e.message);

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setWorking("adding");
    setError(null);
    try {
      for (const file of [...files]) {
        const meta = await uploadImage(owner, await shrinkPhoto(file));
        setImages((list) => [meta, ...list]);
        setChosen((c) => (c.length < MAX_REFERENCE_PHOTOS ? [...c, meta.id] : c));
      }
    } catch (e) {
      fail(e as Error);
    } finally {
      setWorking(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const make = async () => {
    setWorking("making");
    setError(null);
    try {
      const meta = await generateImage({
        owner,
        direction: direction.trim(),
        shape,
        photoIds: chosen,
        baseImageId: baseId ?? undefined,
        card: purpose === "card" ? card : undefined,
      });
      setImages((list) => [meta, ...list]);
      setBaseId(null);
    } catch (e) {
      fail(e as Error);
    } finally {
      setWorking(null);
    }
  };

  const remove = (id: string) =>
    void deleteImage(id)
      .then(() => {
        setImages((list) => list.filter((i) => i.id !== id));
        setChosen((c) => c.filter((x) => x !== id));
        if (baseId === id) setBaseId(null);
      })
      .catch(fail);

  const download = (id: string, n: number) =>
    void fetchImage(id)
      .then((blob) => saveBlob(blob, `${fileStem}-${purpose === "card" ? "card" : "image"}-${n}.${blob.type === "image/jpeg" ? "jpg" : "png"}`))
      .catch(fail);

  const togglePhoto = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_REFERENCE_PHOTOS ? [...c, id] : c));

  const busy = working !== null;
  // With no post or trip behind it, a standalone image needs her words or a photo.
  const nothingToGoOn = purpose === "free" && !direction.trim() && !chosen.length && !baseId;

  return (
    <section id="image-studio" className="card image-studio" aria-label={text.heading}>
      <h2>{text.heading}</h2>
      <p className="muted-note">{text.about}</p>

      {purpose === "card" && <Choices label="Which card?" options={CARD_KINDS} value={card} onChange={setCard} />}
      <Choices label="Shape" options={SHAPE_LABELS} value={shape} onChange={setShape} />

      <div className="field">
        <span className="field-label">Your photos (optional)</span>
        {photos.length > 0 && (
          <p className="muted-note">Tap a photo to use it or not (up to {MAX_REFERENCE_PHOTOS}).</p>
        )}
        <div className="photo-strip">
          {photos.map((p) => (
            <div key={p.id} className={chosen.includes(p.id) ? "photo-thumb chosen" : "photo-thumb"}>
              <button type="button" aria-pressed={chosen.includes(p.id)} aria-label="Use this photo" onClick={() => togglePhoto(p.id)}>
                <img src={imageUrl(p.id)} alt="" loading="lazy" />
              </button>
              <ConfirmDelete label="Delete this photo" onDelete={() => remove(p.id)} />
            </div>
          ))}
          <button type="button" className="btn-quiet" disabled={busy} onClick={() => fileInput.current?.click()}>
            <IconPhotoPlus size={16} aria-hidden /> {working === "adding" ? "Adding…" : "Add photos"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => void addPhotos(e.target.files)}
          />
        </div>
      </div>

      {baseId && (
        <div className="message message-info changing">
          <img src={imageUrl(baseId)} alt="" />
          <span>Changing this image. Say what to change below.</span>
          <button type="button" className="btn-icon" aria-label="Stop changing this image" onClick={() => setBaseId(null)}>
            <IconX size={15} aria-hidden />
          </button>
        </div>
      )}

      <div className="field">
        <label className="field-label" htmlFor={`direction-${key}`}>
          {baseId ? "How should I change it?" : purpose === "free" ? "What should it show?" : "What should it show? (optional)"}
        </label>
        <textarea
          ref={directionBox}
          id={`direction-${key}`}
          value={direction}
          maxLength={1000}
          placeholder={baseId ? "Make the sky pinker, move the words to the top…" : text.placeholder}
          onChange={(e) => setDirection(e.target.value)}
        />
      </div>

      <button type="button" className="btn-primary" disabled={busy || nothingToGoOn} onClick={() => void make()}>
        <IconSparkles size={18} aria-hidden /> {baseId ? "Change it" : "Make an image"}
      </button>

      {working === "making" && (
        <div className="waiting" aria-live="polite">
          <Sparkles />
          <p>Painting your image… (20–40 seconds)</p>
        </div>
      )}
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}

      {made.length > 0 && (
        <div className="image-gallery">
          {made.map((m, i) => (
            <figure key={m.id} className={m.id === baseId ? "made-image base" : "made-image"}>
              <img src={imageUrl(m.id)} alt={m.prompt ? `Image: ${m.prompt}` : "Image made from the details"} loading="lazy" />
              <figcaption className="image-actions">
                <button type="button" className="btn-quiet" onClick={() => download(m.id, made.length - i)}>
                  <IconDownload size={15} aria-hidden /> Download
                </button>
                <button
                  type="button"
                  className="btn-quiet"
                  disabled={busy}
                  onClick={() => {
                    setBaseId(m.id);
                    directionBox.current?.focus();
                  }}
                >
                  <IconPencil size={15} aria-hidden /> Change this one
                </button>
                <ConfirmDelete label="Delete this image" onDelete={() => remove(m.id)} />
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      <ul className="image-notes muted-note">
        <li>Don't upload photos of passports, IDs or cards.</li>
        <li>Made by Google's Nano Banana, about 3¢ an image.</li>
      </ul>
    </section>
  );
}
