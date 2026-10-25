import { IconPlus, IconTrash } from "@tabler/icons-react";
import { emptyLike, humanize, toPrice } from "../lib/editorHelpers";

const STRING_LISTS = new Set(["highlights", "nextSteps", "verifyNotes", "tips", "notes"]);
const LONG_TEXT = new Set(["intro", "summary", "recommendation", "text"]);
const PRICES = new Set(["amount", "unitPrice"]);

interface Props {
  value: unknown;
  onChange(value: unknown): void;
  keyName?: string;
}

/** Edits any deliverable's data: text, lists, prices and repeating rows. */
export function DataEditor({ value, onChange, keyName = "" }: Props) {
  const label = humanize(keyName);

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
    return (
      <fieldset className="editor-group">
        <legend>{label}</legend>
        {value.map((item, i) => (
          <div key={i} className="editor-row">
            <DataEditor value={item} onChange={(v) => onChange(value.map((old, j) => (j === i ? v : old)))} />
            <button type="button" className="btn-quiet" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <IconTrash size={14} aria-hidden /> Remove
            </button>
          </div>
        ))}
        {value.length > 0 && (
          <button type="button" className="btn-quiet" onClick={() => onChange([...value, emptyLike(value[0])])}>
            <IconPlus size={14} aria-hidden /> Add another
          </button>
        )}
      </fieldset>
    );
  }

  if (PRICES.has(keyName)) {
    return (
      <label className="field field-price">
        <span className="field-label">{label}</span>
        <input
          type="text"
          inputMode="decimal"
          placeholder="Add price"
          defaultValue={value === null ? "" : String(value)}
          onBlur={(e) => onChange(toPrice(e.target.value))}
        />
      </label>
    );
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
    const entries = Object.entries(value as Record<string, unknown>);
    const fields = entries.map(([k, v]) => (
      <DataEditor key={k} keyName={k} value={v} onChange={(nv) => onChange({ ...(value as object), [k]: nv })} />
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
