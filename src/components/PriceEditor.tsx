import { useState } from "react";
import { IconFileInvoice, IconListDetails, IconPlus, IconSparkles, IconTrash } from "@tabler/icons-react";
import { MAX_MESSAGE } from "../../shared/conversations";
import { LIST_LIMITS, money, optionTotal, type OptionPrice, type PriceLine } from "../../shared/deliverables";
import { fillFromQuote } from "../lib/api";
import { toLinePrice, toPrice } from "../lib/editorHelpers";
import { AttachButton, AttachStatus, useAttach } from "./AttachButton";
import { TextBox } from "./TextBox";

interface Props {
  value: OptionPrice;
  onChange(value: OptionPrice): void;
  /** The option's name, so a quote covering several options is read for the right one. */
  option?: string;
}

const blankLine = (): PriceLine => ({ label: "", qty: 1, unitPrice: null });

/**
 * An option's price: one amount, or a breakdown (hotel, tickets, fees…) that adds itself up. "Fill from
 * a quote" reads a pasted screenshot, PDF or text into the breakdown.
 */
export function PriceEditor({ value, onChange, option }: Props) {
  const lines = value.lines ?? [];
  const { total, missing, itemized } = optionTotal(value);
  const [filling, setFilling] = useState(false);
  const [filled, setFilled] = useState<{ before: OptionPrice; warning: string | null } | null>(null);

  const setLines = (next: PriceLine[]) => onChange({ ...value, lines: next });
  const setLine = (i: number, change: Partial<PriceLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...change } : l)));
  const sum = lines.reduce((s, l) => s + l.qty * (l.unitPrice ?? 0), 0);

  return (
    <fieldset className="editor-group price-editor">
      <legend>Price</legend>
      {itemized ? (
        <>
          <div className="price-lines">
            {lines.map((l, i) => (
              <div key={i} className="price-line">
                <input
                  type="text"
                  className="line-label"
                  aria-label={`Line ${i + 1}: what it's for`}
                  placeholder="What it's for (room, tickets, fees, a discount…)"
                  value={l.label}
                  onChange={(e) => setLine(i, { label: e.target.value })}
                />
                <button
                  type="button"
                  className="btn-icon line-remove"
                  aria-label={`Remove line ${i + 1}`}
                  title="Remove this line"
                  onClick={() => setLines(lines.filter((_, j) => j !== i))}
                >
                  <IconTrash size={14} aria-hidden />
                </button>
                <input
                  type="number"
                  className="line-qty"
                  aria-label={`Line ${i + 1}: how many`}
                  title="How many"
                  min={1}
                  value={l.qty}
                  onChange={(e) => setLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                />
                <span className="line-op" aria-hidden>
                  ×
                </span>
                <LinePrice label={`Line ${i + 1}: price each`} value={l.unitPrice} onChange={(unitPrice) => setLine(i, { unitPrice })} />
                <span className="line-op" aria-hidden>
                  =
                </span>
                <span className="num subtotal">{l.unitPrice === null ? <span className="gap">Add price</span> : money(l.qty * l.unitPrice)}</span>
              </div>
            ))}
          </div>
          <div className="price-foot">
            {lines.length < LIST_LIMITS.lines.max && (
              <button type="button" className="btn-quiet" onClick={() => setLines([...lines, blankLine()])}>
                <IconPlus size={14} aria-hidden /> Add a line
              </button>
            )}
            <p className="price-total" aria-live="polite">
              {total !== null ? (
                <>
                  Total <strong>{money(total)}</strong>
                </>
              ) : (
                <>
                  Total so far <strong>{money(Math.round(sum * 100) / 100)}</strong>
                  <span className="gap">
                    {missing.length === 1 ? "1 line needs a price" : `${missing.length} lines need a price`}
                  </span>
                </>
              )}
            </p>
          </div>
        </>
      ) : (
        <label className="field field-price">
          <span className="field-label">Price</span>
          <PriceInput value={value.amount} onChange={(amount) => onChange({ ...value, amount })} />
        </label>
      )}
      <label className="field">
        <span className="field-label">Note (nights, who it's for, deposit)</span>
        <input type="text" value={value.note} placeholder="3 nights, 2 adults + 5 kids" onChange={(e) => onChange({ ...value, note: e.target.value })} />
      </label>
      <div className="price-actions">
        <button type="button" className={`btn-quiet${filling ? " active" : ""}`} aria-expanded={filling} onClick={() => setFilling((f) => !f)}>
          <IconFileInvoice size={14} aria-hidden /> Fill from a quote
        </button>
        {itemized ? (
          <button type="button" className="btn-quiet" title="Show the family one price instead of the breakdown" onClick={() => onChange({ ...value, lines: [], amount: total })}>
            Use one price
          </button>
        ) : (
          <button
            type="button"
            className="btn-quiet"
            onClick={() => onChange({ ...value, lines: [{ label: option?.trim() || "Package", qty: 1, unitPrice: value.amount }] })}
          >
            <IconListDetails size={14} aria-hidden /> Break it down
          </button>
        )}
      </div>
      {filled && !filling && (
        <div className="message message-info" role="status">
          {filled.warning ?? "Filled in from the quote. Check each line against it before you send."}{" "}
          <button
            type="button"
            className="link-button"
            onClick={() => {
              onChange(filled.before);
              setFilled(null);
            }}
          >
            Undo
          </button>{" "}
          <button type="button" className="link-button" onClick={() => setFilled(null)}>
            OK
          </button>
        </div>
      )}
      {filling && (
        <QuoteFill
          option={option}
          onFilled={(price, warning) => {
            setFilled({ before: value, warning });
            onChange({ ...price, note: price.note.trim() || value.note });
            setFilling(false);
          }}
          onCancel={() => setFilling(false)}
        />
      )}
    </fieldset>
  );
}

/** Paste or attach the quote, then the assistant itemizes it. */
function QuoteFill({ option, onFilled, onCancel }: { option?: string; onFilled(price: OptionPrice, warning: string | null): void; onCancel(): void }) {
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attacher = useAttach(text, setText, MAX_MESSAGE);
  const busy = working || attacher.reading !== null;

  const fill = async () => {
    setWorking(true);
    setError(null);
    try {
      const { price, warning } = await fillFromQuote(text, option ?? "");
      onFilled(price, warning);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="field quote-fill">
      <div className="field-head">
        <span className="field-label">The quote{option?.trim() ? ` for ${option.trim()}` : ""}</span>
        <AttachButton attacher={attacher} disabled={working} />
      </div>
      <TextBox
        rows={3}
        limit={MAX_MESSAGE}
        value={text}
        aria-label="The quote"
        placeholder="Paste a screenshot of the quote (⌘V), drop it here, or paste its text"
        onChange={setText}
        onFiles={(files) => void attacher.attach(files)}
      />
      <AttachStatus attacher={attacher} />
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      <div className="proposal-actions">
        <button type="button" className="btn-quiet" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-primary" disabled={busy || !text.trim() || text.length > MAX_MESSAGE} onClick={() => void fill()}>
          <IconSparkles size={16} aria-hidden /> {working ? "Reading the prices…" : "Fill in the prices"}
        </button>
      </div>
    </div>
  );
}

/** A typed price that keeps what she's typing ("$2,1…") while it still matches the value. */
function PriceInput({ value, onChange, label }: { value: number | null; onChange(value: number | null): void; label?: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const saved = value === null ? "" : String(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={label}
      placeholder="Add price"
      value={draft !== null && toPrice(draft) === value ? draft : saved}
      onFocus={() => setDraft(saved)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(toPrice(e.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

/** Like PriceInput, but a discount can be typed as "-150" or "(150)". */
function LinePrice({ value, onChange, label }: { value: number | null; onChange(value: number | null): void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const saved = value === null ? "" : String(value);
  return (
    <input
      type="text"
      inputMode="decimal"
      className="line-price"
      aria-label={label}
      placeholder="Add price"
      value={draft !== null && toLinePrice(draft) === value ? draft : saved}
      onFocus={() => setDraft(saved)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(toLinePrice(e.target.value));
      }}
      onBlur={() => setDraft(null)}
    />
  );
}
