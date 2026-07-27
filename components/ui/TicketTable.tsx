"use client";
import type { KeyboardEvent, ReactNode } from "react";
import type { Ticket } from "../../types";
import { AssignCell, ClientCell, MetaCell, SourceTag, StatusPill, TypePrioCell, TypeTag } from "./Chips";

/** The one ticket table. Every staff surface (Tickets, both Dashboard queues)
 *  renders the same eight canonical columns at the same widths (fixed layout +
 *  <colgroup>, widths in globals.css). The client portal renders the client-safe
 *  set — product rule: Team / Member is never shown in client lists — and a single
 *  Type chip in place of Type / Priority. Pass the rows already filtered/paged. */
export function TicketTable({
  tickets,
  audience = "staff",
  onOpen,
  empty,
  unread,
}: {
  tickets: Ticket[];
  audience?: "staff" | "client";
  onOpen: (id: string) => void;
  empty: ReactNode;
  /** Ticket ids with a client message or internal note THIS agent hasn't seen. Staff
   *  surfaces pass the store's set; the client portal passes nothing (unread is an
   *  agent-side concept and the endpoint behind it is staff-only). */
  unread?: string[];
}) {
  const staff = audience === "staff";
  const unreadSet = new Set(unread ?? []);
  const onRowKey = (e: KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(id);
    }
  };
  return (
    <table className={`tk tk-tickets ${staff ? "staff" : "client"}`}>
      <colgroup>
        <col className="c-id" />
        <col className="c-created" />
        <col />
        <col className={staff ? "c-typeprio" : "c-type"} />
        {staff && <col className="c-client" />}
        {staff && <col className="c-team" />}
        <col className="c-status" />
      </colgroup>
      <thead>
        <tr>
          <th className="left">Ticket</th>
          <th className="left">Created</th>
          <th className="left">Title</th>
          {staff ? <th className="left">Type / Priority</th> : <th className="center">Type</th>}
          {staff && <th className="left">Client / Div</th>}
          {staff && <th className="left">Team / Member</th>}
          <th className="center">Status</th>
        </tr>
      </thead>
      <tbody>
        {tickets.length ? (
          tickets.map((t) => {
            const isUnread = unreadSet.has(t.id);
            return (
              <tr
                className={`trow ${isUnread ? "unread" : ""}`}
                key={t.id}
                tabIndex={0}
                role="link"
                aria-label={isUnread ? `Open ticket ${t.id}, has unread activity` : `Open ticket ${t.id}`}
                onClick={() => onOpen(t.id)}
                onKeyDown={(e) => onRowKey(e, t.id)}
              >
                {/* Source rides in front of the id rather than owning a column. It was a
                    28px badge inside a column with its own header and gutters — ~78px of
                    table for one icon, on a table that scrolls. Fixed-width and first, so
                    the ids stay in a straight line whatever the icon is. */}
                <td className="t-id">
                  {isUnread && <span className="unread-dot" aria-hidden="true" />}
                  <SourceTag source={t.source} />
                  <span className="t-id-txt">{t.id}</span>
                </td>
                <td className="left">
                  <MetaCell iso={t.createdISO} />
                </td>
                <td className="t-title" title={t.title}>
                  {t.title}
                </td>
                {staff ? (
                  <td className="left">
                    <TypePrioCell type={t.type} priority={t.priority} />
                  </td>
                ) : (
                  <td className="center">
                    <TypeTag type={t.type} />
                  </td>
                )}
                {staff && (
                  <td className="left">
                    <ClientCell client={t.client} div={t.div} />
                  </td>
                )}
                {staff && (
                  <td className="left">
                    <AssignCell group={t.group} assignee={t.assignee} />
                  </td>
                )}
                <td className="center">
                  <StatusPill status={t.status} />
                </td>
              </tr>
            );
          })
        ) : (
          <tr>
            <td colSpan={staff ? 7 : 5}>{empty}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
