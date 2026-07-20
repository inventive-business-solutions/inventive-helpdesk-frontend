"use client";
import { useId, type ReactNode } from "react";

/** Optional / required marker shown next to a field label. */
function LabelTag({ optional, required }: { optional?: boolean; required?: boolean }) {
  if (required) return <span className="req">required</span>;
  if (optional) return <span className="opt">optional</span>;
  return null;
}

/**
 * Generic labeled-field wrapper for non-text controls (e.g. a <Select>). Generates
 * a stable id, wires the `<label htmlFor>` to it, and hands the id to `children`
 * so the control gets a real accessible name — fixing the orphaned-label a11y gap.
 *
 *   <Field label="Team" optional>{(id) => <Select id={id} … />}</Field>
 */
export function Field({
  label,
  error,
  optional,
  required,
  children,
}: {
  label: ReactNode;
  error?: boolean;
  optional?: boolean;
  required?: boolean;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "invalid" : ""}`.trim()}>
      <label htmlFor={id}>
        {label} <LabelTag optional={optional} required={required} />
      </label>
      {children(id)}
    </div>
  );
}

/**
 * A self-contained text/email/date input with a properly associated label.
 * `onChange` receives the string value. Replaces the repeated
 * `<div className="field"><label/><input/></div>` block across the modals.
 */
export function TextField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  error,
  optional,
  required,
  maxLength,
  autoFocus,
  uppercase,
  readOnly,
  hint,
}: {
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  error?: boolean;
  optional?: boolean;
  required?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
  uppercase?: boolean;
  readOnly?: boolean;
  /** Small helper text rendered under the input. */
  hint?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`field ${error ? "invalid" : ""}`.trim()}>
      <label htmlFor={id}>
        {label} <LabelTag optional={optional} required={required} />
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        readOnly={readOnly}
        aria-invalid={error || undefined}
        style={uppercase ? { textTransform: "uppercase" } : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  );
}

/** A checkbox with an inline label (the input nests in the label, so it's already
 *  associated). Replaces the repeated inline-styled checkbox rows. */
export function CheckboxField({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label className="check-row">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        {children}
      </label>
    </div>
  );
}
