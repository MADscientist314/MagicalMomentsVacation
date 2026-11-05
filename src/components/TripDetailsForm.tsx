import { useState } from "react";
import { IconSparkles } from "@tabler/icons-react";
import { TOOLS } from "../../shared/tools";
import { AttachField } from "./AttachField";
import { TextBox } from "./TextBox";

const PLANNER = TOOLS["adventure-planner"];

interface Props {
  initial: Record<string, string>;
  submitLabel: string;
  busy?: boolean;
  error?: string | null;
  onSubmit(details: Record<string, string>): void;
  onCancel?(): void;
}

/** Client last name plus the Adventure Planner's trip fields. */
export function TripDetailsForm({ initial, submitLabel, busy, error, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(initial);
  const set = (id: string, v: string) => setValues((old) => ({ ...old, [id]: v }));
  const tooLong = PLANNER.fields.find((f) => (values[f.id] ?? "").length > f.maxLength);

  return (
    <form
      className="card trip-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !tooLong) onSubmit(values);
      }}
    >
      <label className="field" htmlFor="trip-lastName">
        <span className="field-label">Client last name</span>
        <input
          id="trip-lastName"
          type="text"
          required
          maxLength={80}
          placeholder="Rivera"
          value={values.lastName ?? ""}
          onChange={(e) => set("lastName", e.target.value)}
        />
      </label>
      {PLANNER.fields.map((f) => {
        const id = `trip-${f.id}`;
        const value = values[f.id] ?? "";
        if (f.attach) {
          return <AttachField key={f.id} id={id} field={f} value={value} rows={5} className="field-material" onChange={(v) => set(f.id, v)} />;
        }
        return (
          <label key={f.id} className="field" htmlFor={id}>
            <span className="field-label">
              {f.label}
              {f.required ? "" : " (optional)"}
            </span>
            {f.kind === "select" ? (
              <select id={id} value={value} required={f.required} onChange={(e) => set(f.id, e.target.value)}>
                <option value="" disabled>
                  Choose one
                </option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.kind === "textarea" ? (
              <TextBox id={id} rows={3} value={value} limit={f.maxLength} placeholder={f.placeholder} onChange={(v) => set(f.id, v)} />
            ) : (
              <input
                id={id}
                type="text"
                value={value}
                required={f.required}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                onChange={(e) => set(f.id, e.target.value)}
              />
            )}
          </label>
        );
      })}
      {values.summary && (
        <div className="message message-info">
          <strong>From the inquiry:</strong> {values.summary}
        </div>
      )}
      {(error || tooLong) && (
        <p className="message message-error" role="alert">
          {tooLong ? `“${tooLong.label}” is too long — keep it under ${tooLong.maxLength.toLocaleString("en-US")} characters.` : error}
        </p>
      )}
      <div className="proposal-actions">
        {onCancel && (
          <button type="button" className="btn-quiet" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy || Boolean(tooLong)}>
          <IconSparkles size={18} aria-hidden />
          {busy ? "Working on it…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
