/** KPI tile: a colored left stripe, label, big value, and a sub-line. Optionally clickable. */
export function Kpi({
  label,
  value,
  sub,
  color,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <div
      className={`kpi ${onClick ? "clickable" : ""} ${active ? "active" : ""}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? !!active : undefined}
      style={active ? { ["--kc" as string]: color } : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      <span className="stripe" style={{ background: color }} />
      <div className="label">{label}</div>
      <div className="val">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
