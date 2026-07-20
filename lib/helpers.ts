import type { Status, Ticket, TicketType } from "../types";

const ACTIVE: Status[] = ["New", "Acknowledged", "In Progress", "Pending Client", "Reopened"];
export const RESOLVED: Status[] = ["Resolved", "Closed"];

export const isActive = (s: Status) => ACTIVE.includes(s);
export const isResolved = (s: Status) => RESOLVED.includes(s);

/** URL-encode a query-param value. */
export const enc = encodeURIComponent;

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
