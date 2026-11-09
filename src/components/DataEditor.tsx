import { useState } from "react";
import { IconPlus, IconTrash } from "@tabler/icons-react";
import { LIST_LIMITS, type OptionPrice } from "../../shared/deliverables";
import { emptyLike, humanize, PICTURE_KEYS, ROW_TEMPLATES, toPrice } from "../lib/editorHelpers";
import { PriceEditor } from "./PriceEditor";

const STRING_LISTS = new Set(["highlights", "nextSteps", "verifyNotes", "tips", "notes", "checklist"]);
const LONG_TEXT = new Set(["intro", "summary", "recommendation", "text"]);
const PRICES = new Set(["amount", "unitPrice"]);

interface Props {
  value: unknown;
  onChange(value: unknown): void;
  keyName?: string;
  /** The name of the row this field belongs to (a proposal option's name, for its price). */
  rowName?: string;
}

const isOptionPrice = (x: unknown): x is OptionPrice =>
  typeof x === "object" && x !== null && "amount" in x && "note" in x && !Array.isArray(x);

/** Edits any deliverable's data: text, lists, prices and repeating rows. */
export function DataEditor({ value, onChange, keyName = "", rowName }: Props) {
  const label = humanize(keyName);

  // A proposal option's price: one amount, or a breakdown that adds itself up.
  if (keyName === "price" && isOptionPrice(value)) {
    return <PriceEditor value={value} onChange={onChange} option={rowName} />;
  }

  if (STRING_LISTS.has(keyName) && Array.isArray(value)) {
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        <textarea
          value={(value as string[]).join("\n")}
          onChange={(e) => onChange(e.target.value.split("\n"))}
        />
      </label>
    );
  }

  if (Array.isArray(value)) {
    // A proposal keeps at least one option (and at most four); an itinerary at least one day.
    const { min, max } = LIST_LIMITS[keyName] ?? { min: 0, max: Infinity };
    const template = value.length ? value[0] : ROW_TEMPLATES[keyName];
    return (
      <fieldset className="editor-group">
        <legend>{label}</legend>
        {value.map((item, i) => (
          <div key={i} className="editor-row">
            <DataEditor value={item} onChange={(v) => onChange(value.map((old, j) => (j === i ? v : old)))} />
            {value.length > min && (
              <button type="button" className="btn-quiet" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <IconTrash size={14} aria-hidden /> Remove
              </button>
            )}
          </div>
        ))}
        {template !== undefined && value.length < max && (
          <button type="button" className="btn-quiet" onClick={() => onChange([...value, emptyLike(template)])}>
            <IconPlus size={14} aria-hidden /> Add {value.length ? "another" : "one"}
          </button>
        )}
      </fieldset>
    );
  }

  if (PRICES.has(keyName)) {
    return <PriceField label={label} value={value as number | null} onChange={onChange} />;
  }

  if (typeof value === "number") {
    return (
      <label className="field field-small">
        <span className="field-label">{label}</span>
        <input type="number" min={1} value={value} onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))} />
      </label>
    );
  }

  if (typeof value === "string" || (value === null && keyName === "time")) {
    const text = (value as string | null) ?? "";
    const set = (v: string) => onChange(keyName === "time" && !v.trim() ? null : v);
    return (
      <label className="field">
        <span className="field-label">{label}</span>
        {LONG_TEXT.has(keyName) ? (
          <textarea value={text} onChange={(e) => set(e.target.value)} />
        ) : (
          <input type="text" value={text} onChange={(e) => set(e.target.value)} />
        )}
      </label>
    );
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([k]) => !PICTURE_KEYS.has(k));
    const name = (value as Record<string, unknown>).name;
    const fields = entries.map(([k, v]) => (
      <DataEditor
        key={k}
        keyName={k}
        value={v}
        rowName={typeof name === "string" ? name : undefined}
        onChange={(nv) => onChange({ ...(value as object), [k]: nv })}
      />
    ));
    return keyName ? (
      <fieldset className="editor-group">
        <legend>{label}</legend>
        {fields}
      </fieldset>
    ) : (
      <div className="editor-object">{fields}</div>
    );
  }

  return null;
}

/**
 * Shows what she's typing ("$7,6…") only while it still matches the row's value; otherwise the row's
 * real value. So if rows shift (Remove), a typed price can't show on, or later be saved to, another row.
 */
function PriceField({ label, value, onChange }: { label: string; value: number | null; onChange(value: unknown): void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const saved = value === null ? "" : String(value);
  return (
    <label className="field field-price">
      <span className="field-label">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        placeholder="Add price"
        value={draft !== null && toPrice(draft) === value ? draft : saved}
        onFocus={() => setDraft(saved)}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(toPrice(e.target.value));
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}
