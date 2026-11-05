import type { FieldDef } from "../../shared/tools";
import { AttachButton, AttachStatus, useAttach } from "./AttachButton";
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

/**
 * A big text box with the paperclip beside its label: she can paste an email, or attach a PDF
 * or a saved email (also by dragging it onto the box), whose text is read into the box.
 */
export function AttachField({ id, field, value, onChange, rows, className }: Props) {
  const attacher = useAttach(value, onChange, field.maxLength);
  return (
    <div className={`field${className ? ` ${className}` : ""}`}>
      <div className="field-head">
        <label className="field-label" htmlFor={id}>
          {field.label}
          {field.required ? "" : " (optional)"}
        </label>
        <AttachButton attacher={attacher} />
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
