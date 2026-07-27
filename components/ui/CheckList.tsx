"use client";
import { useId } from "react";

export type CheckListOption = { value: string; label: string; hint?: string };

/**
 * A scrollable table of toggles for assigning several things at once — leads to a
 * division, divisions to a product.
 *
 * Laid out as a table (name · code · access) rather than a checkbox stack: these rows
 * carry two pieces of information each, and a bare checkbox list ran them together into
 * one unreadable line. Column headings say what each column is, so "PRJ-ELE" reads as a
 * code rather than part of the name.
 *
 * The body scrolls at a fixed cap with the header pinned above it — a client with twenty
 * divisions must not produce a control taller than the viewport, which would push the
 * dialog's own footer out of reach.
 */
export function CheckList({
  label,
  hint,
  options,
  selected,
  onChange,
  labelHead = "Name",
  metaHead = "Code",
  emptyText = "Nothing to choose from yet.",
}: {
  label: string;
  hint?: string;
  options: CheckListOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Heading for the first column. */
  labelHead?: string;
  /** Heading for the second column (the `hint` on each option). */
  metaHead?: string;
  emptyText?: string;
}) {
  const id = useId();
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {hint && <div className="checklist-hint">{hint}</div>}
      {options.length === 0 ? (
        <div className="checklist-empty">{emptyText}</div>
      ) : (
        <div className="checklist" id={id} role="group" aria-label={label}>
          <div className="checklist-head" aria-hidden="true">
            <span>{labelHead}</span>
            <span>{metaHead}</span>
            <span className="checklist-head-access">Access</span>
          </div>
          <div className="checklist-body">
            {options.map((o) => {
              const on = selected.includes(o.value);
              return (
                <label className={`checklist-row ${on ? "is-on" : ""}`.trim()} key={o.value}>
                  <span className="checklist-label" title={o.label}>
                    {o.label}
                  </span>
                  <span className="checklist-meta">{o.hint ?? "—"}</span>
                  {/* The input stays in the DOM and focusable — it is what a keyboard and a
                      screen reader actually operate; the switch beside it is only paint. */}
                  <input
                    type="checkbox"
                    className="sw-input"
                    checked={on}
                    aria-label={`${o.label}${o.hint ? ` (${o.hint})` : ""}`}
                    onChange={() => toggle(o.value)}
                  />
                  <span className="switch" aria-hidden="true" />
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
