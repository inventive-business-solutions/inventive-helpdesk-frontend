import type { ReactNode } from "react";
import type { Priority, Status, TicketType } from "../../types";
import { fmtShortDate, fmtTime, statusClass, typeClass } from "../../lib/helpers";
import { Icon } from "./Icon";

/** The one badge primitive for every chip that isn't a ticket chip: division/team
 *  chips, portal-status markers, counts, context pills. Two shapes (chip / round),
 *  a `sm` micro-marker size and a numeric `count` variant, six tones — all driven
 *  by the shared --chip-* / --radius-* tokens. No chip styling exists outside this
 *  system; contextual classes may only add layout (margins, max-widths). */
export type BadgeTone = "neutral" | "accent" | "good" | "warning" | "critical" | "info";
export const Badge = ({
  tone = "neutral",
  round = false,
  sm = false,
  count = false,
  className,
  title,
  children,
}: {
  tone?: BadgeTone;
  round?: boolean;
  sm?: boolean;
  count?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) => {
  const cls = [
    "badge",
    tone !== "neutral" && `t-${tone}`,
    round && "round",
    sm && "sm",
    count && "num",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={cls} title={title}>
      {children}
    </span>
  );
};

/** Explicit source, shown as a symbol only (no label) to keep the column tight:
 *  an envelope for Email, a monitor for anything raised in the portal. The word
 *  lives in the tooltip / aria-label so the meaning stays accessible. */
export const SourceTag = ({ source }: { source?: "Portal" | "Email" }) => {
  const email = source === "Email";
  const label = email ? "Received by email" : "Raised in portal";
  return (
    <span className={`src-tag ${email ? "email" : "portal"}`} title={label} aria-label={label}>
      <Icon name={email ? "mail" : "monitor"} size={14} />
    </span>
  );
};

/** Trailing tickets-table cell: the created date over its time — short and
 *  constant-width (mono) so the column stays aligned. `iso` is the raw creation
 *  timestamp; the date/time are formatted here. */
export const MetaCell = ({ iso }: { iso?: string }) => (
  <div className="meta-cell">
    <span className="meta-date">{fmtShortDate(iso)}</span>
    <span className="meta-time">{fmtTime(iso)}</span>
  </div>
);

/** Requester side, stacked: client on top, its division below (only when present).
 *  Unmatched email tickets (client "—") read as a muted "Unmatched". */
export const ClientCell = ({ client, div }: { client: string; div?: string }) => {
  const unmatched = !client || client === "—";
  const hasDiv = !unmatched && !!div && div !== "—";
  return (
    <div className="stack-cell">
      <span className={`stack-top${unmatched ? " muted" : ""}`} title={unmatched ? "Unmatched" : client}>
        {unmatched ? "Unmatched" : client}
      </span>
      {hasDiv ? (
        <span className="stack-bottom" title={div}>
          {div}
        </span>
      ) : null}
    </div>
  );
};

/** Handler side, stacked: the assignment team on top, the member below. Muted
 *  placeholders ("No team" / "Unassigned") keep both lines — and the column —
 *  aligned even when a ticket isn't routed yet. Staff-only; never shown to clients. */
export const AssignCell = ({ group, assignee }: { group?: string; assignee?: string }) => {
  const member = assignee && assignee !== "Unassigned" ? assignee : "";
  return (
    <div className="stack-cell">
      <span className={`stack-top${group ? "" : " muted"}`} title={group || "No team"}>
        {group || "No team"}
      </span>
      <span className={`stack-bottom${member ? "" : " muted"}`} title={member || "Unassigned"}>
        {member || "Unassigned"}
      </span>
    </div>
  );
};

/** `lg` is the one sanctioned size-up (30px), used only in the ticket-detail header. */
export const IdChip = ({ id, lg }: { id: string; lg?: boolean }) => (
  <span className={`id-chip${lg ? " lg" : ""}`}>{id}</span>
);

export const TypeTag = ({ type, lg }: { type: TicketType; lg?: boolean }) => (
  <span className={`type-tag ${typeClass(type)}${lg ? " lg" : ""}`}>{type}</span>
);

export const PriorityTag = ({ priority }: { priority: Priority }) => (
  <span className={`prio ${priority}`}>{priority}</span>
);

/** Type over Priority, stacked in one column. Both chips are forced to equal width
 *  (see .chip-stack CSS) so the pair reads as a neat block and the column edges line
 *  up row-to-row. */
export const TypePrioCell = ({ type, priority }: { type: TicketType; priority: Priority }) => (
  <div className="chip-stack">
    <TypeTag type={type} />
    <PriorityTag priority={priority} />
  </div>
);

export const StatusPill = ({ status, lg }: { status: Status; lg?: boolean }) => (
  <span className={`pill ${statusClass(status)}${lg ? " lg" : ""}`}>{status}</span>
);
