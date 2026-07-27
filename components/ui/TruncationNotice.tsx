"use client";
import { Icon } from "@/components/ui/Icon";
import { MASTER_FETCH_CAP, TICKET_FETCH_CAP, useStore } from "@/store";

/**
 * Says so when the ticket fetch came back at its cap.
 *
 * The fetch is bounded (see TICKET_FETCH_CAP), and filtering, sorting and every dashboard
 * figure are still computed in the browser over whatever came back. So past the cap this
 * app does not just show fewer rows — it computes SMALLER NUMBERS, and would do it
 * silently. A dashboard that under-reports without saying so is worse than a slow one,
 * because nothing about it looks wrong.
 *
 * Shared rather than written per page so the wording cannot drift into implying the
 * figures are complete on one screen and not another. `what` names what is affected on
 * this particular page, since "filters apply only to these" and "these figures cover only
 * these" are different warnings and the reader needs the right one.
 *
 * Renders nothing in the ordinary case, so pages can mount it unconditionally.
 */
export function TruncationNotice({ what }: { what: string }) {
  const truncated = useStore((s) => s.ticketsTruncated);
  if (!truncated) return null;
  return (
    <div className="banner">
      <Icon name="info" />
      <span>
        Showing the <b>most recent {TICKET_FETCH_CAP.toLocaleString()}</b> tickets. Older ones are not loaded,
        and {what}.
      </span>
    </div>
  );
}

/**
 * The same warning for master data — clients, contacts, products, members, teams.
 *
 * Those lists were unbounded until now, so this state could not arise; capping them makes
 * it possible, which is precisely why it has to be visible. Every count on these pages is
 * derived in the browser from what was fetched, so past the cap they are floors rather than
 * totals — and a record someone swears exists would simply not be findable, with nothing on
 * screen explaining why.
 */
export function MasterTruncationNotice({ what }: { what: string }) {
  const truncated = useStore((s) => s.mastersTruncated);
  if (!truncated) return null;
  return (
    <div className="banner">
      <Icon name="info" />
      <span>
        This list hit its load limit of <b>{MASTER_FETCH_CAP.toLocaleString()}</b> records, so {what}. Narrow
        the list with search, or ask for server-side paging if you have grown past this.
      </span>
    </div>
  );
}
