import { useRef, useState } from "react";
import { IconArrowBackUp, IconPlus, IconTrash } from "@tabler/icons-react";
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
    return <ListEditor keyName={keyName} value={value} onChange={onChange} />;
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

/** Rows that get their own card with a numbered heading and a Remove button at the top (Nov 15 review). */
const ROW_NAMES: Record<string, string> = { options: "Option", days: "Day", lineItems: "Line", sections: "Section" };

const rowTitle = (item: unknown): string => {
  if (typeof item !== "object" || item === null) return "";
  const r = item as Record<string, unknown>;
  const t = [r.name, r.title, r.heading, r.label].find((x) => typeof x === "string" && x.trim());
  return typeof t === "string" ? t.trim() : "";
};

/**
 * A repeating list (options, days, activities…). Each row keeps its own key, so after a Remove nothing a row
 * was holding (a price being typed, a quote's Undo) moves onto the row below it. A removed row can be put back.
 */
function ListEditor({ keyName, value, onChange }: { keyName: string; value: unknown[]; onChange(value: unknown): void }) {
  const label = humanize(keyName);
  const { min, max } = LIST_LIMITS[keyName] ?? { min: 0, max: Infinity };
  const template = value.length ? value[0] : ROW_TEMPLATES[keyName];
  const rowName = ROW_NAMES[keyName];
  const keys = useRef<number[]>([]);
  const nextKey = useRef(0);
  const [removed, setRemoved] = useState<{ index: number; item: unknown; key: number; title: string } | null>(null);
  // Keep one key per row: a list that grew (Add, a new version) gets new keys at the end.
  while (keys.current.length < value.length) keys.current.push(nextKey.current++);
  if (keys.current.length > value.length) keys.current = keys.current.slice(0, value.length);

  const remove = (i: number) => {
    const key = keys.current[i];
    keys.current = keys.current.filter((_, j) => j !== i);
    setRemoved({ index: i, item: value[i], key, title: rowName ? `${rowName} ${i + 1}${rowTitle(value[i]) ? ` (${rowTitle(value[i])})` : ""}` : "that row" });
    onChange(value.filter((_, j) => j !== i));
  };
  const undo = () => {
    if (!removed) return;
    const at = Math.min(removed.index, value.length);
    keys.current = [...keys.current.slice(0, at), removed.key, ...keys.current.slice(at)];
    onChange([...value.slice(0, at), removed.item, ...value.slice(at)]);
    setRemoved(null);
  };
  const add = () => {
    setRemoved(null);
    onChange([...value, emptyLike(template)]);
  };
  const canRemove = value.length > min;
  const set = (i: number) => (v: unknown) => onChange(value.map((old, j) => (j === i ? v : old)));

  return (
    <fieldset className={`editor-group${rowName ? " editor-cards" : ""}`}>
      <legend>{label}</legend>
      {value.map((item, i) =>
        rowName ? (
          <section key={keys.current[i]} className="editor-card" aria-label={`${rowName} ${i + 1}`}>
            <div className="editor-card-head">
              <span className="editor-card-title">
                {rowName} {i + 1}
                {rowTitle(item) && <span className="editor-card-name">: {rowTitle(item)}</span>}
              </span>
              {canRemove && (
                <button type="button" className="btn-quiet btn-remove" onClick={() => remove(i)}>
                  <IconTrash size={14} aria-hidden /> Remove {rowName.toLowerCase()} {i + 1}
                </button>
              )}
            </div>
            <DataEditor value={item} onChange={set(i)} />
          </section>
        ) : (
          <div key={keys.current[i]} className="editor-row">
            <DataEditor value={item} onChange={set(i)} />
            {canRemove && (
              <button type="button" className="btn-quiet" onClick={() => remove(i)}>
                <IconTrash size={14} aria-hidden /> Remove
              </button>
            )}
          </div>
        ),
      )}
      {removed && (
        <p className="message message-info removed-note" role="status">
          Removed {removed.title}.{" "}
          <button type="button" className="link-button" onClick={undo}>
            <IconArrowBackUp size={14} aria-hidden /> Put it back
          </button>
        </p>
      )}
      {template !== undefined && value.length < max && (
        <button type="button" className="btn-quiet" onClick={add}>
          <IconPlus size={14} aria-hidden /> Add {value.length ? `another${rowName ? ` ${rowName.toLowerCase()}` : ""}` : "one"}
        </button>
      )}
    </fieldset>
  );
}
