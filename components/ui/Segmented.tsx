import type { ReactNode } from "react";
import { Badge } from "./Chips";

export interface SegmentedOption<K extends string = string> {
  key: K;
  label: ReactNode;
  /** Optional leading glyph (an <Icon />). */
  icon?: ReactNode;
  /** Optional trailing numeric count, rendered as a Badge that tints when active. */
  count?: number;
}

interface Props<K extends string> {
  options: readonly SegmentedOption<K>[];
  value: K;
  onChange: (key: K) => void;
  /** "tablist" gives each segment role=tab + aria-selected; "group" is a plain toggle group. */
  role?: "tablist" | "group";
  /** Segments stretch to fill the row (ticket streams, breakdown tabs). */
  fullWidth?: boolean;
  ariaLabel?: string;
  className?: string;
}

/**
 * The one segmented control: a pill container whose active segment lifts onto a surface
 * chip. Replaces the old .seg / .stream-tabs patterns; the semantic visibility toggle
 * (.vis-toggle) and the priority grid (.prio-seg) stay separate — different concepts.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
  role = "tablist",
  fullWidth = false,
  ariaLabel,
  className = "",
}: Props<K>) {
  const cls = ["segmented", fullWidth ? "full" : "", className].filter(Boolean).join(" ");
  const tabs = role === "tablist";
  return (
    <div className={cls} role={role} aria-label={ariaLabel}>
      {options.map((o) => {
        const active = value === o.key;
        return (
          <button
            key={o.key}
            type="button"
            role={tabs ? "tab" : undefined}
            aria-selected={tabs ? active : undefined}
            className={active ? "on" : ""}
            onClick={() => onChange(o.key)}
          >
            {o.icon}
            {o.label}
            {o.count != null && (
              <Badge count className="seg-count">
                {o.count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
