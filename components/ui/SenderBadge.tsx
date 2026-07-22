"use client";
import { Icon } from "./Icon";
import type { Ticket } from "@/types";

/**
 * Where a ticket came from, and whether a reply can actually reach the person who sent it.
 *
 * Staff-only, and deliberately always visible rather than tucked into a detail panel: the
 * failure this prevents is an agent writing a careful reply to an address nobody reads.
 * The classification is derived server-side (`sender.classify`) — the frontend only
 * renders it, so a stale or crafted client payload cannot make an unreachable sender look
 * reachable.
 */
const SENDER_COPY: Record<
  NonNullable<Ticket["senderKind"]>,
  { label: string; tone: "ok" | "warn" | "danger"; hint: string }
> = {
  Registered: {
    label: "Registered",
    tone: "ok",
    hint: "Has a portal login — replies reach them by email and in the portal.",
  },
  "Known Contact": {
    label: "Known contact",
    tone: "warn",
    hint: "On file, but never invited to the portal. Replies go by email only.",
  },
  Unregistered: {
    label: "Unregistered sender",
    tone: "warn",
    hint: "Not linked to any account. Replies go by email only.",
  },
  "No Reply": {
    label: "No-reply address",
    tone: "danger",
    hint: "An unmonitored mailbox — a reply is unlikely to be read by anyone.",
  },
};

export function SenderBadge({ ticket }: { ticket: Ticket }) {
  const kind = ticket.senderKind;
  if (!kind) return null;
  const copy = SENDER_COPY[kind];
  const address = ticket.fromEmail;

  return (
    <div className="sender-strip">
      {ticket.source ? <span className="sender-chip src">{ticket.source}</span> : null}
      <span className={`sender-chip ${copy.tone}`} title={copy.hint}>
        {copy.tone === "danger" ? <Icon name="alert" size={13} /> : null}
        {copy.label}
        {address ? <span className="sender-addr">{address}</span> : null}
      </span>
      {/* The reason is only ever set for No Reply, and it names the rule or pattern that
          matched — so an operator can tell a configured rule from a built-in guess. */}
      {kind === "No Reply" && ticket.noReplyReason ? (
        <span className="sender-reason">{ticket.noReplyReason}</span>
      ) : null}
    </div>
  );
}
