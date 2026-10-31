import { IconSparkles } from "@tabler/icons-react";
import type { ToolDef } from "../../shared/tools";

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
  return (
    <form
      className="card"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) onSubmit();
      }}
    >
      {tool.fields.map((f) => {
        const id = `field-${f.id}`;
        const value = values[f.id] ?? "";
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
              <textarea
                id={id}
                value={value}
                required={f.required}
                maxLength={f.maxLength}
                placeholder={f.placeholder}
                onChange={(e) => onChange(f.id, e.target.value)}
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
      {error && (
        <p className="message message-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p className="message message-info">{notice}</p>}
      <button type="submit" className="btn-primary" disabled={busy}>
        <IconSparkles size={18} aria-hidden />
        {busy ? "Working on it…" : "Draft it"}
      </button>
    </form>
  );
}
