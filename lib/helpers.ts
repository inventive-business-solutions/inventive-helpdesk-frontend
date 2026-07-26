import type { Status, Ticket, TicketType } from "../types";

const ACTIVE: Status[] = ["New", "Acknowledged", "In Progress", "Pending Client", "Reopened"];
export const RESOLVED: Status[] = ["Resolved", "Closed"];

export const isActive = (s: Status) => ACTIVE.includes(s);
export const isResolved = (s: Status) => RESOLVED.includes(s);

/** URL-encode a query-param value. */
export const enc = encodeURIComponent;

/** What `toTicket` substitutes for a field the backend left empty. It is a DISPLAY
 *  string, not data — an em dash reads as "nothing here" in a table cell. */
export const NO_VALUE = "—";

/** True when a ticket has no client: an email we could not attribute to anyone.
 *  Has to test the placeholder as well as emptiness, because the mapper has already
 *  replaced the empty value by the time any view sees it. */
export const isUnmatched = (client?: string) => !client || client === NO_VALUE;

/** "1 client" / "2 clients" / "0 clients". */
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Every contact of a client, each person exactly once.
 *
 *  The assembled tree lists a contact under EVERY division they hold, and lists Leads
 *  separately at client level — so a Lead covering three divisions appears four times
 *  across the structure, and a Lead with no divisions appears only in `leads`. Summing
 *  `divisions[].pocs.length` therefore counted that Lead three times and an unassigned
 *  one zero times. Keyed on email, which is the POC's identity (it is the docname). */
export function clientContacts(client: {
  leads?: { id?: string; email: string }[];
  divisions?: { pocs?: { id?: string; email: string }[] }[];
}) {
  const seen = new Map<string, { id?: string; email: string }>();
  for (const p of [...(client.leads ?? []), ...(client.divisions ?? []).flatMap((d) => d.pocs ?? [])]) {
    const key = (p.email || p.id || "").toLowerCase();
    if (key && !seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

// ---- products (engagements) ------------------------------------------------
// A client runs products through `Client Product` rows ("engagements"), each optionally
// scoped to divisions. An engagement with NO divisions covers the client as a whole —
// the only shape available to a client with no divisions, and a deliberate choice for one
// with them. The rule below is the same one Portal.tsx already applies to a contact's own
// divisions; these helpers exist so the staff-side views apply it identically.

/** Resolve a division docname ("Thermax-HTG") to its display name ("Heating").
 *
 *  Load-bearing, and the reason this is a named function rather than an inline includes():
 *  engagements store division DOCNAMES, while `Ticket.div` holds the DISPLAY name (see
 *  toTicket in lib/frappe.ts). Comparing the two directly matches nothing, for every
 *  product, and reads as "no tickets" rather than as a bug. */
export function divDisplayName(client: ClientLike, docname: string): string {
  return client.divisions?.find((d) => d.docname === docname)?.name ?? docname;
}

/** The shape these helpers need from a Client. Structural rather than importing `Client`
 *  so the unit tests can build fixtures without inventing every unrelated field.
 *  `docname` is optional because a division created client-side has no docname until it
 *  is saved — matching types.ts. */
type ClientLike = {
  name: string;
  products?: { product: string; divisions: string[] }[];
  divisions?: { name: string; docname?: string }[];
};

/** Distinct products this client runs. Replaces the legacy one-product-per-client read. */
export function productsOf(client?: ClientLike | null): string[] {
  return [...new Set((client?.products ?? []).map((p) => p.product))];
}

/** Distinct products visible to someone who holds `divisionDocnames` — client-wide
 *  engagements plus those covering at least one of their divisions.
 *
 *  Takes DOCNAMES, not display names: this compares against `ClientProduct.divisions`,
 *  which stores docnames, and against `session.divisions` from `me()`, which also does.
 *  (Only `Ticket.div` carries the display name — see divDisplayName.) */
export function productsForDivisions(client: ClientLike | null | undefined, divisionDocnames: string[]) {
  return [
    ...new Set(
      (client?.products ?? [])
        .filter((p) => !p.divisions.length || p.divisions.some((d) => divisionDocnames.includes(d)))
        .map((p) => p.product),
    ),
  ];
}

/** Clients with at least one engagement of `product`. */
export function clientsRunning<T extends ClientLike>(clients: T[], product: string): T[] {
  return clients.filter((c) => (c.products ?? []).some((p) => p.product === product));
}

/** The products a ticket at this client + division may legitimately be about — i.e. the
 *  valid options for the product picker, and what the backend's validate will accept.
 *
 *  Engagements scoped to the division, plus any attached client-wide. `t.div` is a DISPLAY
 *  name while engagements store docnames, so they are resolved before comparing — the
 *  mismatch that silently matches nothing if skipped (see divDisplayName).
 *
 *  This used to be `productsForTicket`, deriving a ticket's product because the ticket had
 *  no product field. It has one now, so its job is offering the choices, not guessing. */
export function availableProducts(clients: ClientLike[], t: { client: string; div: string }): string[] {
  const c = clients.find((x) => x.name === t.client);
  if (!c) return [];
  return [
    ...new Set(
      (c.products ?? [])
        .filter((p) => !p.divisions.length || p.divisions.some((dn) => divDisplayName(c, dn) === t.div))
        .map((p) => p.product),
    ),
  ];
}

/** Compact relative age: "just now", "12m", "2h", "3d", "5w".
 *
 *  Call this when MAPPING a ticket, not when rendering one. Relative time depends on
 *  `Date.now()`, so computing it in render makes the server and client disagree — the
 *  classic hydration mismatch — and it would drift between renders of the same row. The
 *  30s poll re-maps and keeps it fresh, which is how `ageFrom` already works. */
export function relativeAge(iso?: string, now: number = Date.now()): string {
  const d = parseISO(iso);
  if (!d) return "—";
  const mins = Math.floor((now - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 53) return `${weeks}w`;
  return `${Math.floor(days / 365)}y`;
}

/** Parse a Frappe datetime/date string ("YYYY-MM-DD[ HH:mm:ss]") to a Date, or
 *  null if absent/unparseable. */
export function parseISO(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T"));
  return isNaN(d.getTime()) ? null : d;
}

/** A ticket "needs attention" when it's new, has sat pending on the client for a
 *  while, or is an active SLA risk. Single source of truth for the dashboard KPI,
 *  its table, and the `attention=1` ticket filter (they must not drift apart). */
export function needsAttention(t: Ticket): boolean {
  return (
    t.status === "New" ||
    (t.status === "Pending Client" && parseInt(t.age) >= 5) ||
    (t.slaRisk && isActive(t.status))
  );
}

export function statusClass(s: Status): string {
  const map: Record<Status, string> = {
    New: "s-new",
    Acknowledged: "s-ack",
    "In Progress": "s-prog",
    "Pending Client": "s-pending",
    Resolved: "s-resolved",
    Closed: "s-closed",
    Reopened: "s-reopened",
  };
  return map[s] || "s-ack";
}

export const typeClass = (t: TicketType) => "type-" + (t === "New Feature" ? "Feature" : t);

/** Pragmatic email check: non-empty local part, one @, a dotted domain. */
export function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Format an ISO date (YYYY-MM-DD) as "10 July 2026". */
export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1] || ""} ${y}`;
}

/** Format a Date as "10 July 2026, 9:14 AM" (12-hour). */
export function fmtDateTime(dt: Date): string {
  const date = `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
  let h = dt.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(dt.getMinutes()).padStart(2, "0");
  return `${date}, ${h}:${min} ${ampm}`;
}

/** Short, constant-width date "12/06/2026" (DD/MM/YYYY, zero-padded) so a stacked
 *  date column lines up row-to-row. Expects a full datetime string (has a time
 *  component); date-only values would need the UTC guard fmtDay uses. */
export function fmtShortDate(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

/** Time of day in 12-hour form, e.g. "9:14 AM"; empty when unparseable. */
export function fmtTime(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  let h = d.getHours();
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${min} ${ampm}`;
}

export function makeCode(str: string, used?: Set<string>): string {
  const base = (String(str).match(/[A-Za-z0-9]/g) || ["X"]).join("").slice(0, 3).toUpperCase().padEnd(3, "X");
  let code = base;
  let i = 1;
  while (used && used.has(code)) {
    code = base.slice(0, 2) + i;
    i++;
  }
  return code;
}

/** Chip tone for a Team Member's access status: green once they've signed in, amber
 *  while an invite is pending, grey before any invite has been sent. */
export function memberStatusTone(status: string): "good" | "warning" | "neutral" {
  return status === "Active" ? "good" : status === "Invited" ? "warning" : "neutral";
}
