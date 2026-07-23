"use client";
import { useId, useState, type ReactNode } from "react";

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
  // An empty date input paints the browser's own scaffold, whose separators render as a
  // row of dashes ("dd-----yyyy") that reads as a half-filled value rather than a prompt.
  // Date inputs take no `placeholder` and ignore `::placeholder`, so we hide that scaffold
  // whenever the field is empty — including while focused — and lay a clean
  // "DD / MM / YYYY" over it.
  //
  // Clicking therefore opens the native calendar instead of parking a caret in an
  // invisible editor: you pick a date and never meet the scaffold at all.
  //
  // `typing` is the exception that keeps the keyboard usable. Someone who tabs in and
  // types needs to see the digits land, and a date input reports value="" until the whole
  // date is valid — so without this they would be typing blind. The first keypress
  // reveals the editor; leaving the field empty puts the placeholder back.
  const [typing, setTyping] = useState(false);
  const dateEmpty = type === "date" && !value;
  const input = (
    <input
      id={id}
      type={type}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      autoFocus={autoFocus}
      readOnly={readOnly}
      aria-invalid={error || undefined}
      data-empty={dateEmpty && !typing ? "true" : undefined}
      style={uppercase ? { textTransform: "uppercase" } : undefined}
      onChange={(e) => onChange(e.target.value)}
      {...(type === "date" && {
        onMouseDown: (e: React.MouseEvent<HTMLInputElement>) => {
          if (readOnly) return;
          // showPicker needs a user gesture, which a mousedown is. Preventing default
          // stops the caret landing in the hidden editor behind the placeholder.
          const el = e.currentTarget;
          if (typeof el.showPicker !== "function") return;
          // preventDefault keeps focus off the input entirely. Focusing it would make the
          // browser select its first segment, and a selected segment paints a highlight
          // that no amount of colour styling hides. showPicker only needs the user
          // gesture, not focus.
          e.preventDefault();
          try {
            el.showPicker();
          } catch {
            /* not allowed in this context — the field still works by typing */
          }
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
          if (e.key.length === 1 || e.key === "Backspace" || e.key.startsWith("Arrow")) {
            setTyping(true);
          }
        },
        onBlur: () => setTyping(false),
      })}
    />
  );
  return (
    <div className={`field ${error ? "invalid" : ""}`.trim()}>
      <label htmlFor={id}>
        {label} <LabelTag optional={optional} required={required} />
      </label>
      {type === "date" ? (
        <span className="date-wrap">
          {input}
          {dateEmpty && !typing && (
            // aria-hidden + pointer-events:none — it is decoration. The input keeps its
            // own label and stays the thing that is focused, typed into and clicked.
            <span className="date-ph" aria-hidden="true">
              {placeholder || "DD / MM / YYYY"}
            </span>
          )}
        </span>
      ) : (
        input
      )}
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
