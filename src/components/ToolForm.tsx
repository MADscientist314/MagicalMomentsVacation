import { IconSparkles } from "@tabler/icons-react";
import type { ToolDef } from "../../shared/tools";
import { AttachField } from "./AttachField";
import { TextBox } from "./TextBox";

interface Props {
  tool: ToolDef;
  values: Record<string, string>;
  onChange(id: string, value: string): void;
  onSubmit(): void;
  busy: boolean;
  error: string | null;
  notice: string | null;
}

export function ToolForm({ tool, values, onChange, onSubmit, busy, error, notice }: Props) {
  const tooLong = tool.fields.find((f) => (values[f.id] ?? "").length > f.maxLength);
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !tooLong) onSubmit();
      }}
    >
      {tool.fields.map((f) => {
        const id = `field-${f.id}`;
        const value = values[f.id] ?? "";
        if (f.kind === "textarea" && f.attach) {
          return (
            <AttachField key={f.id} id={id} field={f} value={value} rows={8} className={`field-${f.id}`} onChange={(v) => onChange(f.id, v)} />
          );
        }
        if (f.kind === "choice") {
          const chosen = value || f.options?.[0];
          return (
            <fieldset key={f.id} className={`field field-${f.id}`}>
              <legend className="field-label">{f.label}</legend>
              <div className="choices" role="radiogroup" aria-label={f.label}>
                {f.options?.map((o) => (
                  <button
                    key={o}
                    type="button"
                    role="radio"
                    aria-checked={chosen === o}
                    className={chosen === o ? "choice chosen" : "choice"}
                    onClick={() => onChange(f.id, o)}
                  >
                    {o}
                  </button>
                ))}
              </div>
            </fieldset>
          );
        }
        return (
          <label key={f.id} className={`field field-${f.id}`} htmlFor={id}>
            <span className="field-label">
              {f.label}
              {f.required ? "" : " (optional)"}
            </span>
            {f.kind === "select" ? (
              <select id={id} value={value} required={f.required} onChange={(e) => onChange(f.id, e.target.value)}>
                <option value="" disabled>
                  Choose one
                </option>
                {f.options?.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : f.kind === "textarea" ? (
              <TextBox
                id={id}
                rows={f.maxLength > 5_000 ? 8 : 4}
                value={value}
                required={f.required}
                limit={f.maxLength}
                placeholder={f.placeholder}
                onChange={(v) => onChange(f.id, v)}
              />
            ) : (
              <input
                id={id}
                type="text"
                value={value}
                required={f.required}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.id, e.target.value)}
              />
            )}
          </label>
        );
      })}
      {(error || tooLong) && (
        <p className="message message-error" role="alert">
          {tooLong ? `“${tooLong.label}” is too long — keep it under ${tooLong.maxLength.toLocaleString("en-US")} characters.` : error}
        </p>
      )}
      {notice && <p className="message message-info">{notice}</p>}
      <button type="submit" className="btn-primary" disabled={busy || Boolean(tooLong)}>
        <IconSparkles size={18} aria-hidden />
        {busy ? "Working on it…" : "Draft it"}
      </button>
    </form>
  );
}
