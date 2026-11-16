import type { FieldDef } from "../../shared/tools";
import { joinTranscript } from "../lib/speech";
import { AttachButton, AttachStatus, useAttach } from "./AttachButton";
import { MicButton } from "./MicButton";
import { TextBox } from "./TextBox";

interface Props {
  id: string;
  field: FieldDef;
  value: string;
  onChange(value: string): void;
  rows: number;
  /** Extra class for the wrapper, e.g. "field-material". */
  className?: string;
}

const label = (field: FieldDef) => `${field.label}${field.required ? "" : " (optional)"}`;

/**
 * A big text box with the paperclip and the mic beside its label: she can paste an email, talk, or attach
 * a PDF or a saved email (also by dragging it onto the box), whose text is read into the box.
 */
export function AttachField({ id, field, value, onChange, rows, className }: Props) {
  const attacher = useAttach(value, onChange, field.maxLength);
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <div className="field-head">
        <label className="field-label" htmlFor={id}>
          {label(field)}
        </label>
        <span className="field-tools">
          <AttachButton attacher={attacher} />
          <MicButton onSpeech={(heard) => onChange(joinTranscript(value, heard))} />
        </span>
      </div>
      <TextBox
        id={id}
        rows={rows}
        limit={field.maxLength}
        value={value}
        required={field.required}
        placeholder={field.placeholder}
        onChange={onChange}
        onFiles={(files) => void attacher.attach(files)}
      />
      <AttachStatus attacher={attacher} />
    </div>
  );
}

/** A text box with the mic beside its label, so she can talk instead of typing (Nov 15 review). */
export function TalkField({ id, field, value, onChange, rows, className }: Props) {
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <div className="field-head">
        <label className="field-label" htmlFor={id}>
          {label(field)}
        </label>
        <span className="field-tools">
          <MicButton onSpeech={(heard) => onChange(joinTranscript(value, heard))} />
        </span>
      </div>
      <TextBox id={id} rows={rows} limit={field.maxLength} value={value} required={field.required} placeholder={field.placeholder} onChange={onChange} />
    </div>
  );
}
