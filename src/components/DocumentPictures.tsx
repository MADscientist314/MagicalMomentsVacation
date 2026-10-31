import { useEffect, useRef, useState } from "react";
import { IconPhotoPlus, IconSparkles, IconTrash, IconUser } from "@tabler/icons-react";
import { MAX_REFERENCE_PHOTOS, type ImageMeta } from "../../shared/images";
import type { Itinerary } from "../../shared/deliverables";
import { generateImage, imageUrl, listImages, uploadImage } from "../lib/api";
import { shrinkPhoto } from "../lib/photos";

type Slot = "cover" | number;

interface Props {
  tripId: string;
  /** The saved version the pictures are made from. */
  deliverableId: string;
  /** How many days that saved version has (a day added since can't get a picture until it's saved). */
  savedDays: number;
  plan: Itinerary;
  onChange(update: (plan: Itinerary) => Itinerary): void;
}

const slotKey = (slot: Slot) => String(slot);

function withPhoto(plan: Itinerary, slot: Slot, id: string | undefined): Itinerary {
  const place = <T extends object>(o: T, key: string): T => {
    const { [key]: _old, ...rest } = o as Record<string, unknown>;
    return (id ? { ...rest, [key]: id } : rest) as T;
  };
  if (slot === "cover") return place(plan, "coverPhoto");
  return { ...plan, days: plan.days.map((d, i) => (i === slot ? place(d, "photo") : d)) };
}

/** Pictures for an itinerary: made from each day's plan (with the family's own photos if she adds them), or her photo as is. */
export function DocumentPictures({ tripId, deliverableId, savedDays, plan, onChange }: Props) {
  const owner = { type: "trip" as const, id: tripId };
  const [family, setFamily] = useState<ImageMeta[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [working, setWorking] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listImages(owner)
      .then((list) => setFamily(list.filter((i) => i.kind === "upload")))
      .catch((e: Error) => setErrors({ family: e.message }));
  }, [tripId]);

  const slots: { slot: Slot; label: string; id?: string }[] = [
    { slot: "cover", label: "Cover", id: plan.coverPhoto },
    ...plan.days.map((d, i) => ({ slot: i as Slot, label: d.title, id: d.photo })),
  ];
  const canMake = (slot: Slot) => slot === "cover" || slot < savedDays;

  const make = async (slot: Slot) => {
    const key = slotKey(slot);
    setWorking((w) => ({ ...w, [key]: true }));
    setErrors(({ [key]: _old, ...rest }) => rest);
    try {
      const meta = await generateImage({ owner, direction: "", shape: "wide", photoIds: chosen, deliverableId, slot });
      onChange((p) => withPhoto(p, slot, meta.id));
    } catch (e) {
      setErrors((all) => ({ ...all, [key]: (e as Error).message }));
    } finally {
      setWorking(({ [key]: _done, ...rest }) => rest);
    }
  };

  /** Fills every empty picture, three at a time. */
  const makeAll = async () => {
    const queue = slots.filter((s) => !s.id && canMake(s.slot)).map((s) => s.slot);
    const run = async () => {
      for (let slot = queue.shift(); slot !== undefined; slot = queue.shift()) await make(slot);
    };
    await Promise.all([run(), run(), run()]);
  };

  const addPhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    setAdding(true);
    setErrors(({ family: _old, ...rest }) => rest);
    try {
      for (const file of [...files]) {
        const meta = await uploadImage(owner, await shrinkPhoto(file));
        setFamily((list) => [meta, ...list]);
        setChosen((c) => (c.length < MAX_REFERENCE_PHOTOS ? [...c, meta.id] : c));
      }
    } catch (e) {
      setErrors((all) => ({ ...all, family: (e as Error).message }));
    } finally {
      setAdding(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const toggle = (id: string) =>
    setChosen((c) => (c.includes(id) ? c.filter((x) => x !== id) : c.length < MAX_REFERENCE_PHOTOS ? [...c, id] : c));

  const busy = Object.keys(working).length > 0;
  const empty = slots.some((s) => !s.id && canMake(s.slot));

  return (
    <section className="document-pictures" aria-label="Pictures">
      <h3>Pictures</h3>
      <p className="muted-note">
        Pictures of a family enjoying each day, made from the plan (about 3¢ each). Add the family's own photos to put them in
        the pictures, or to use a photo as it is.
      </p>

      <div className="field">
        <span className="field-label">The family's photos (optional)</span>
        {family.length > 0 && <p className="muted-note">Tap a photo to use it or not (up to {MAX_REFERENCE_PHOTOS}).</p>}
        <div className="photo-strip">
          {family.map((p) => (
            <div key={p.id} className={chosen.includes(p.id) ? "photo-thumb chosen" : "photo-thumb"}>
              <button type="button" aria-pressed={chosen.includes(p.id)} aria-label="Use this photo" onClick={() => toggle(p.id)}>
                <img src={imageUrl(p.id)} alt="" loading="lazy" />
              </button>
            </div>
          ))}
          <button type="button" className="btn-quiet" disabled={adding} onClick={() => fileInput.current?.click()}>
            <IconPhotoPlus size={16} aria-hidden /> {adding ? "Adding…" : "Add photos"}
          </button>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files)} />
        </div>
        {errors.family && <p className="message message-error">{errors.family}</p>}
      </div>

      {empty && (
        <button type="button" className="btn-primary" disabled={busy} onClick={() => void makeAll()}>
          <IconSparkles size={16} aria-hidden /> {chosen.length ? "Make pictures with the family" : "Make all pictures"}
        </button>
      )}

      <ul className="picture-slots">
        {slots.map(({ slot, label, id }) => {
          const key = slotKey(slot);
          return (
            <li key={key} className="picture-slot">
              {id ? <img src={imageUrl(id)} alt="" /> : <div className="picture-empty">No picture</div>}
              <div className="picture-slot-body">
                <strong>{label}</strong>
                {working[key] ? (
                  <p className="muted-note">Painting… (20–40 seconds)</p>
                ) : (
                  <div className="image-actions">
                    {canMake(slot) ? (
                      <button type="button" className="btn-quiet" disabled={busy} onClick={() => void make(slot)}>
                        <IconSparkles size={15} aria-hidden /> {id ? "Remake" : "Make picture"}
                      </button>
                    ) : (
                      <span className="muted-note">Save this version first to make a picture for this day.</span>
                    )}
                    {chosen.length > 0 && (
                      <button type="button" className="btn-quiet" onClick={() => onChange((p) => withPhoto(p, slot, chosen[0]))}>
                        <IconUser size={15} aria-hidden /> Use my photo
                      </button>
                    )}
                    {id && (
                      <button type="button" className="btn-quiet" onClick={() => onChange((p) => withPhoto(p, slot, undefined))}>
                        <IconTrash size={15} aria-hidden /> Remove
                      </button>
                    )}
                  </div>
                )}
                {errors[key] && <p className="message message-error">{errors[key]}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
