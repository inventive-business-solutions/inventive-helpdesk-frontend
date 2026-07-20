import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/** The one empty/placeholder state, used by every table, stream and panel.
 *  Copy convention: "No <thing> yet — <suggestion>." (bold the control name when
 *  pointing at one). `compact` tightens the padding for streams and small panels. */
export function EmptyState({
  icon,
  compact,
  children,
}: {
  icon?: IconName;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`empty-state${compact ? " compact" : ""}`}>
      {icon && <Icon name={icon} size={40} strokeWidth={1.6} />}
      <div>{children}</div>
    </div>
  );
}
