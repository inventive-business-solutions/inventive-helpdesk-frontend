"use client";
import { Icon } from "@/components/ui/Icon";
import { TICKET_FETCH_CAP, useStore } from "@/store";

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
