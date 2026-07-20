import type { ReactNode } from "react";

interface Props {
  value: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Content alignment inside the cell. */
  align?: "start" | "center";
  title?: string;
}

/**
 * A compact metric cell (value over label) used inside a hairline-divided strip — client
 * summary cards and product rows. The strip container owns the columns, dividers and (for
 * products) the click target; this owns the cell. `Kpi` remains the larger stripe-and-sub
 * dashboard tile — a different object, deliberately not merged here.
 */
export function StatTile({ value, label, onClick, disabled, align = "start", title }: Props) {
  const cls = ["stat", align === "center" ? "center" : ""].filter(Boolean).join(" ");
  const body = (
    <>
      <span className="stat-v">{value}</span>
      <span className="stat-l">{label}</span>
    </>
  );
  // Render as a button when it can be clicked or is an explicitly-disabled cell, so the
  // interactive and inert cells in the same strip stay visually identical.
  if (onClick || disabled) {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled} title={title}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}
