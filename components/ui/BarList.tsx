export interface BarRow {
  label: string;
  value: number;
  color: string;
  href?: string;
  /** Emphasise this row (e.g. the "Unassigned" triage queue pinned on top). */
  highlight?: boolean;
}

/**
 * Aligned horizontal bars: label · common-width track · count at the end.
 * Rows are clickable when an href + onSelect are provided. When `limit` is set,
 * only the first `limit` rows are shown; the "+N more" cue then fires `onMore`
 * (e.g. to open the full-list modal). Bars scale to the visible set.
 */
export function BarList({
  rows,
  onSelect,
  limit,
  onMore,
}: {
  rows: BarRow[];
  onSelect?: (href: string) => void;
  limit?: number;
  /** Action for the "+N more" cue — e.g. open a modal with the complete list. */
  onMore?: () => void;
}) {
  const shown = limit != null ? rows.slice(0, limit) : rows;
  const hidden = rows.length - shown.length;
  const max = Math.max(1, ...shown.map((r) => r.value));
  return (
    <div className="bars">
      {shown.map((r, i) => {
        const inner = (
          <>
            <span className="k">
              <span className="k-label">{r.label}</span>
            </span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(r.value / max) * 100 || 3}%`, background: r.color }}
              />
            </span>
            <span className="v">{r.value}</span>
          </>
        );
        const cls = r.highlight ? "bar-row flag" : "bar-row";
        return onSelect && r.href ? (
          <button type="button" className={cls} key={`${r.label}-${i}`} onClick={() => onSelect(r.href!)}>
            {inner}
          </button>
        ) : (
          <div className={cls} key={`${r.label}-${i}`}>
            {inner}
          </div>
        );
      })}
      {hidden > 0 &&
        (onMore ? (
          <button type="button" className="bar-more" onClick={onMore}>
            +{hidden} more
          </button>
        ) : (
          <div className="bar-more">+{hidden} more</div>
        ))}
    </div>
  );
}
