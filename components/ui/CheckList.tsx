"use client";
import { useId } from "react";

export type CheckListOption = { value: string; label: string; hint?: string };

/**
 * A scrollable multi-select for assigning several things at once — leads to a division,
 * divisions to a product.
 *
 * Deliberately a bounded, scrolling list rather than a growing stack of checkboxes: a
 * client with twenty divisions would otherwise produce a control taller than the viewport
 * and push the modal's own footer out of reach. The height cap lives in CSS (`.checklist`)
 * so the list scrolls inside itself and the dialog around it never does.
 */
export function CheckList({
  label,
  hint,
  options,
  selected,
  onChange,
  emptyText = "Nothing to choose from yet.",
}: {
  label: string;
  hint?: string;
  options: CheckListOption[];
  selected: string[];
  onChange: (next: string[]) => void;
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
          {options.map((o) => (
            <label className="checklist-row" key={o.value}>
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              <span className="checklist-label">{o.label}</span>
              {o.hint && <span className="checklist-meta">{o.hint}</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
