/**
 * Typed Frappe REST client. All calls go same-origin to `/api/frappe/*`, which
 * Next.js proxies to the Frappe backend (see next.config.mjs), so the session
 * cookie is carried automatically. The server enforces tenant isolation and
 * hides internal work notes (permlevel) — this client just maps shapes.
 */
import type {
  Activity,
  Attachment,
  Client,
  ClientProduct,
  ClientStatus,
  Collaborator,
  Division,
  Group,
  Message,
  Poc,
  PortalStatus,
  Priority,
  Stamped,
  Status,
  TeamMember,
  Ticket,
  TicketType,
  WorkNote,
} from "../types";
import { NO_VALUE, fmtDateTime, relativeAge } from "./helpers";

const BASE = "/api/frappe";

export class FrappeError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** True when `message` is meant for a human — a validation message the backend wrote,
     *  or one we wrote here. False when it is only the HTTP status text ("Internal Server
     *  Error"), which says nothing useful and should not be shown as if it were advice. */
    readonly displayable = false,
  ) {
    super(message);
  }
}

/** An error whose message was written for the user and is safe to put on screen.
 *  Store actions throw this for rules they enforce client-side (duplicate names and the
 *  like); anything else that escapes is a bug, and its message stays internal. */
export class UserError extends Error {}

/**
 * A sign-in that failed AFTER the password was accepted.
 *
 * Signing in is not one request: it authenticates, then reads the session, then loads the
 * master data and tickets the app cannot start without. A failure in that second half — a
 * missing role, a permission gap, the backend going away mid-sequence — used to surface as
 * "check your email and password", which is advice to fix the one thing that is definitely
 * correct. Someone can spend a long time re-typing a password that was never wrong.
 *
 * `cause` keeps the original for logging; `message` is what a person should read.
 */
export class PostAuthError extends UserError {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** Wrap a post-authentication failure, preferring a message the backend actually wrote. */
export function asPostAuthError(err: unknown): PostAuthError {
  if (err instanceof PostAuthError) return err;
  const detail = userFacingMessage(err);
  if (detail) return new PostAuthError(detail, err);
  // A 403 here means authenticated-but-not-permitted, which is a setup problem on the
  // account rather than anything the person signing in can correct.
  if (err instanceof FrappeError && err.status === 403) {
    return new PostAuthError(
      "Your password was accepted, but this account isn't set up to use the helpdesk yet. Please contact your administrator.",
      err,
    );
  }
  return new PostAuthError(
    "Your password was accepted, but we couldn't load your workspace. Please try again, or contact your administrator if it keeps happening.",
    err,
  );
}

/** The message to show for a failed action, or null when there is nothing worth showing
 *  and the caller should fall back to a generic line. Deliberately narrow: an unexpected
 *  TypeError also has a `.message`, and "Cannot read properties of undefined" must never
 *  be toasted at a support agent. */
export function userFacingMessage(err: unknown): string | null {
  if (err instanceof UserError) return err.message || null;
  if (err instanceof FrappeError && err.displayable) return err.message || null;
  return null;
}

// CSRF token (from `me()`); attached to every mutating request. Harmless while
// the dev site has ignore_csrf on, required once it's enforced in production.
let csrfToken = "";
export function setCsrfToken(token?: string | null) {
  csrfToken = token || "";
}

// In-flight mutation tracking, so a background auto-refresh never clobbers an optimistic
// update or a save the user just made. Every non-GET request counts. A refresh checks
// this before applying its result (see store.refreshTickets / loadTicket): it skips while
// a mutation is in flight, and discards its own result if a mutation completed during the
// fetch (i.e. its data may already be stale).
let pendingMutations = 0;
let mutationSeq = 0;
/** True while any create/update/delete/whitelisted-POST request is in flight. */
export const isMutating = () => pendingMutations > 0;
/** Increments each time a mutation finishes — a refresh discards its result if this
 *  changed between starting and finishing its fetch. */
export const mutationVersion = () => mutationSeq;

// When the session is actually gone, bounce to /login exactly once.
let redirecting = false;
let authCheckInFlight = false;
function goToLogin() {
  if (redirecting || typeof window === "undefined") return;
  redirecting = true;
  // Preserve where the user was as ?next, so re-login returns them there instead of
  // dropping to role-home (mirrors the server middleware's auth gate). Skip it for the
  // root and the auth pages themselves.
  const dest = window.location.pathname + window.location.search;
  const keep = dest !== "/" && !dest.startsWith("/login") && !dest.startsWith("/set-password");
  window.location.assign(keep ? `/login?next=${encodeURIComponent(dest)}` : "/login");
}
async function maybeHandleAuthLoss() {
  if (redirecting || authCheckInFlight || typeof window === "undefined") return;
  // Public pages manage their own auth — never auto-bounce them to /login. /set-password
  // deliberately probes me() while the visitor may still be a guest.
  if (["/login", "/set-password"].includes(window.location.pathname)) return;
  authCheckInFlight = true;
  try {
    // A 401/403 may be a legit permission denial (still logged in) — only bounce
    // if the session is truly gone.
    if ((await loggedUser()) === "Guest") goToLogin();
  } catch {
    goToLogin();
  } finally {
    authCheckInFlight = false;
  }
}

/** Pull a clean, human message out of a Frappe error body. `_server_messages` is a
 *  JSON string of an array of JSON strings, each like `{"message":"…"}` (and the
 *  messages may contain HTML) — so unwrap and strip tags rather than surfacing the
 *  raw escaped JSON to the user. Falls back to the plainer error fields. */
function serverErrorMessage(json: Record<string, unknown>): string | null {
  const raw = json._server_messages;
  if (typeof raw === "string") {
    try {
      const first = (JSON.parse(raw) as string[])
        .map((entry) => {
          try {
            return (JSON.parse(entry) as { message?: string }).message ?? entry;
          } catch {
            return entry;
          }
        })
        .find(Boolean);
      if (first) return first.replace(/<[^>]*>/g, "").trim();
    } catch {
      /* not the shape we expected — fall through to the plain fields */
    }
  }
  // Only ever surface a clean, human message. Never fall back to `exc`/`exc_type`:
  // those carry a Python traceback / internal class name, which must not reach the UI
  // (this runs on the unauthenticated set-password page too). The caller uses the plain
  // HTTP status text when there's no safe message here.
  const message = json.message;
  if (typeof message === "string" && message) return message;
  return null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method || "GET").toUpperCase();
  const mutating = method !== "GET";
  if (mutating) pendingMutations++;
  try {
    // Let the browser set the multipart boundary for FormData uploads; only JSON
    // bodies get an explicit Content-Type.
    const isForm = typeof FormData !== "undefined" && init?.body instanceof FormData;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init?.body && !isForm ? { "Content-Type": "application/json" } : {}),
      ...((init?.headers as Record<string, string>) || {}),
    };
    if (mutating && csrfToken) headers["X-Frappe-CSRF-Token"] = csrfToken;

    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, { ...init, method, credentials: "include", headers });
    } catch (e) {
      throw new FrappeError("Network error — is the backend reachable?", 0, true);
    }

    const text = await res.text();
    let json: Record<string, unknown> = {};
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = { _nonjson: true }; // HTML error page / gateway response
      }
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) void maybeHandleAuthLoss();
      // A message the backend wrote is worth showing; bare status text is not.
      const serverMessage = serverErrorMessage(json);
      throw new FrappeError(serverMessage || res.statusText, res.status, Boolean(serverMessage));
    }
    return json as T;
  } finally {
    if (mutating) {
      pendingMutations--;
      mutationSeq++;
    }
  }
}

// ---- auth -----------------------------------------------------------------
export async function login(usr: string, pwd: string): Promise<{ full_name: string }> {
  return request("/method/login", { method: "POST", body: JSON.stringify({ usr, pwd }) });
}
export async function logout(): Promise<void> {
  await request("/method/logout", { method: "POST" });
}
/** True when a sign-in failed because the account is disabled — i.e. the person was
 *  removed from the system. Frappe returns "User disabled or missing" for that (only
 *  once the password is correct), vs "Invalid login credentials" for a bad password —
 *  so this never reveals disabled-status to someone who doesn't know the password. Lets
 *  the sign-in page show a clear "no access, contact your admin" message. */
export function isAccountDisabledError(err: unknown): boolean {
  return err instanceof FrappeError && /disabled/i.test(err.message);
}
/** Trigger the password-reset email. Guest-callable; we never reveal whether the address
 *  exists (avoids user enumeration).
 *
 *  Ours, not `frappe.core.doctype.user.user.reset_password` — that one builds its link with
 *  get_url(), so the mail pointed at the BACKEND host's /update-password, i.e. the Frappe
 *  desk. Portal clients have no business there, and it isn't our product. The app endpoint
 *  retargets the same key at this app's /set-password, matching the invite mail. */
export async function requestPasswordReset(user: string): Promise<void> {
  await request("/method/inventive_helpdesk_backend.api.request_password_reset", {
    method: "POST",
    body: JSON.stringify({ user }),
  });
}
/** Set a password from an invite/reset key and (server-side) sign the user in — the
 *  session cookie comes back through the proxy on this origin. Guest-callable. Throws
 *  FrappeError(410) when the key is invalid or expired. */
export async function setPassword(key: string, newPassword: string): Promise<void> {
  await request("/method/frappe.core.doctype.user.user.update_password", {
    method: "POST",
    body: JSON.stringify({ key, new_password: newPassword }),
  });
}
async function loggedUser(): Promise<string> {
  const r = await request<{ message: string }>("/method/frappe.auth.get_logged_user");
  return r.message;
}

/** Call a whitelisted server method; returns its `message`. */
export async function call<T = unknown>(method: string, args?: Record<string, unknown>): Promise<T> {
  const r = await request<{ message: T }>(`/method/${method}`, {
    method: "POST",
    body: JSON.stringify(args || {}),
  });
  return r.message;
}

export interface Me {
  user: string;
  role: "admin" | "client" | null;
  /** Staff sub-tier: managers manage the org; agents (false) only work tickets. */
  manage?: boolean;
  /** Site owner: may grant/revoke manager access. The server enforces this regardless. */
  is_owner?: boolean;
  /** Staff only: this user's Team Member docname (matches ticket.assignee). */
  member?: string | null;
  /** Staff only: the member's job title. Free text and often blank. */
  title?: string;
  /** Staff only: assignment groups the member belongs to. */
  teams?: string[];
  /** Staff only: true when a non-manager agent (convenience mirror of !manage). */
  is_agent?: boolean;
  name?: string;
  client?: string;
  /** Every division this contact holds — the real portal scope. */
  divisions?: string[];
  /** First of `divisions`, for views that display a single label. Not authoritative. */
  division?: string;
  division_name?: string;
  division_code?: string;
  csrf_token?: string | null;
}
/** Session context for the signed-in user (role + client/division scope + CSRF).
 *  GET so it works before we hold a CSRF token (used right after login). */
export async function me(): Promise<Me> {
  const r = await request<{ message: Me }>("/method/inventive_helpdesk_backend.api.me");
  return r.message;
}

// Controlled ticket mutations (server appends atomically + enforces scope/role).
/** Post a client-visible reply. `sendEmail` is the agent's toggle and is only a REQUEST —
 *  the server decides (sender.reply_plan), and reports back what it actually did so the
 *  UI can say so rather than implying the toggle was obeyed. */
export function addTicketMessage(
  ticket: string,
  body: string,
  attachments?: Attachment[],
  sendEmail?: boolean,
) {
  return call<{ ticket: string; emailed: boolean; detail: string }>(
    "inventive_helpdesk_backend.api.add_message",
    {
      ticket,
      body,
      attachments: attachments || [],
      ...(sendEmail === undefined ? {} : { send_email: sendEmail ? 1 : 0 }),
    },
  );
}
export function addTicketNote(ticket: string, body: string, attachments?: Attachment[]) {
  return call<string>("inventive_helpdesk_backend.api.add_note", {
    ticket,
    body,
    attachments: attachments || [],
  });
}
export function reopenTicket(ticket: string) {
  return call<string>("inventive_helpdesk_backend.api.reopen", { ticket });
}
/** Self-assign a ticket from the caller's team queue (team-first; agent must be on the
 *  ticket's team). Bumps a New ticket to Acknowledged server-side. */
export function claimTicket(ticket: string) {
  return call<string>("inventive_helpdesk_backend.api.claim_ticket", { ticket });
}
/** Ticket ids with a client message or internal note this agent hasn't seen. Per agent —
 *  a teammate reading a reply doesn't clear it for you. Staff only; the backend throws
 *  PermissionError for a client POC, so the portal never calls this. */
export function unreadTickets() {
  return call<string[]>("inventive_helpdesk_backend.api.unread_tickets");
}
/** Dashboard figures counted server-side (api.ticket_stats).
 *
 *  Scoped to the caller by the same permission_query_conditions as every list read, so a
 *  portal contact receives their own divisions' numbers and a manager receives the site's.
 *  Breakdown keys are docnames (or "" for an empty Link), values are counts. */
export interface TicketStats {
  counts: {
    total: number;
    active: number;
    resolved: number;
    needs_attention: number;
    sla_risk: number;
    email: number;
    to_system: number;
    to_member: number;
  };
  by_status: Record<string, number>;
  by_priority: Record<string, number>;
  by_type: Record<string, number>;
  by_client: Record<string, number>;
  by_assignee: Record<string, number>;
  by_team: Record<string, number>;
  trend: { week: string; created: number; resolved: number }[];
}

/** Fetch the dashboard aggregates. `weeks` sizes the trend window; the server clamps it. */
export function ticketStats(weeks?: number) {
  return call<TicketStats>("inventive_helpdesk_backend.api.ticket_stats", {
    ...(weeks === undefined ? {} : { trend_weeks: weeks }),
  });
}

/** Called when an agent opens a ticket, clearing their own unread marker for it. */
export function markTicketRead(ticket: string) {
  return call<string>("inventive_helpdesk_backend.api.mark_ticket_read", { ticket });
}
/** Loop a team or member onto a ticket as a Collaborator (read + internal-note access,
 *  no ownership change). */
export function addCollaborator(ticket: string, partyType: "Team" | "Member", party: string) {
  return call<string>("inventive_helpdesk_backend.api.add_collaborator", {
    ticket,
    party_type: partyType,
    party,
  });
}
export function removeCollaborator(ticket: string, partyType: "Team" | "Member", party: string) {
  return call<string>("inventive_helpdesk_backend.api.remove_collaborator", {
    ticket,
    party_type: partyType,
    party,
  });
}
/** Upload a file as a PRIVATE attachment on a ticket (server enforces the ticket's tenant
 *  scope). Returns {name, url}; `url` is a Frappe /private/files path — render it with
 *  attachmentHref(). `onTicket` also records it on the ticket's description-level list
 *  (used when a ticket is raised with attachments). */
export async function uploadAttachment(ticket: string, file: File, onTicket = false): Promise<Attachment> {
  const form = new FormData();
  form.append("ticket", ticket);
  if (onTicket) form.append("on_ticket", "1");
  form.append("file", file, file.name);
  const r = await request<{ message: Attachment }>(
    "/method/inventive_helpdesk_backend.api.upload_attachment",
    {
      method: "POST",
      body: form,
    },
  );
  return r.message;
}

// ---- client / POC administration (staff) ---------------------------------
// These go through whitelisted methods (not raw REST) because they rename
// autonamed docs and cascade Link references — a plain field update can't.
export function updateClient(
  name: string,
  patch: {
    client_name?: string;
    client_code?: string;
    since?: string;
    status?: ClientStatus;
  },
) {
  return call<string>("inventive_helpdesk_backend.api.update_client", { name, ...patch });
}
export function updateProduct(name: string, patch: { product_name?: string }) {
  return call<string>("inventive_helpdesk_backend.api.update_product", { name, ...patch });
}
export function updatePoc(
  name: string,
  patch: { poc_name?: string; email?: string; phone?: string; divisions?: string[] },
) {
  return call<string>("inventive_helpdesk_backend.api.update_poc", { name, ...patch });
}
export function deletePoc(name: string) {
  return call<string>("inventive_helpdesk_backend.api.delete_poc", { name });
}
/** Create a client contact — a division POC or a Lead, same record either way.
 *  `divisions` may be empty, and for a Lead usually is: they are added during onboarding,
 *  before any division exists, and hold no ticket access until someone assigns them. */
export function createContact(args: {
  client: string;
  poc_name: string;
  email: string;
  phone?: string;
  is_lead?: 0 | 1;
  divisions: string[];
}) {
  return call<string>("inventive_helpdesk_backend.api.create_contact", args);
}
/** Replace the divisions a contact can see. This IS the access-granting call: the set
 *  passed here becomes their entire scope, so anything omitted loses access. */
export function setContactDivisions(name: string, divisions: string[]) {
  return call<string>("inventive_helpdesk_backend.api.set_contact_divisions", { name, divisions });
}
export function createClientProduct(args: {
  client: string;
  product: string;
  dev_start?: string | null;
  expected_completion?: string | null;
  divisions: string[];
}) {
  return call<string>("inventive_helpdesk_backend.api.create_client_product", args);
}
export function updateClientProduct(args: {
  name: string;
  product?: string;
  dev_start?: string | null;
  expected_completion?: string | null;
  divisions?: string[];
}) {
  return call<string>("inventive_helpdesk_backend.api.update_client_product", args);
}
export function deleteClientProduct(name: string) {
  return call<string>("inventive_helpdesk_backend.api.delete_client_product", { name });
}
/** Provision (or resend) a POC's portal login + sign-in email. */
export function invitePoc(poc: string) {
  return call<{ user: string; email_sent: boolean }>("inventive_helpdesk_backend.api.invite_poc", { poc });
}
/** Provision (or resend) a team member's staff login + set-password email. The member
 *  flips to Active on their first sign-in (server-side on_login hook). */
export function inviteMember(member: string) {
  return call<{ user: string; email_sent: boolean }>("inventive_helpdesk_backend.api.invite_member", {
    member,
  });
}

/** One row of the admin console: a team member and which tier they hold. */
export interface AdminRow {
  name: string;
  member_name: string;
  email: string;
  title?: string | null;
  status: string;
  user?: string | null;
  /** False when the member has no linked account yet — nothing to grant a role to. */
  can_delegate: boolean;
  is_admin: boolean;
  is_owner: boolean;
}

export function listAdmins() {
  return call<AdminRow[]>("inventive_helpdesk_backend.api.list_admins");
}

export function adminCandidates() {
  return call<AdminRow[]>("inventive_helpdesk_backend.api.admin_candidates");
}

export function setMemberAdmin(member: string, admin: boolean) {
  return call<{ member: string; is_admin: boolean; changed: boolean }>(
    "inventive_helpdesk_backend.api.set_member_admin",
    { member, admin },
  );
}

// ---- generic resource helpers --------------------------------------------
type ListOpts = {
  fields?: string[];
  filters?: unknown[];
  limit?: number;
  orderBy?: string;
  /** Parent doctype, required by Frappe when listing a CHILD table (e.g. "POC Division").
   *  Without it the request is rejected — child rows are permission-checked through their
   *  parent, so the server has to be told which parent to check against. Lets us read every
   *  POC's divisions in one call instead of a getDoc per contact. */
  parent?: string;
};

export async function getList<T = Record<string, unknown>>(
  doctype: string,
  opts: ListOpts = {},
): Promise<T[]> {
  const p = new URLSearchParams();
  p.set("fields", JSON.stringify(opts.fields ?? ["*"]));
  if (opts.filters) p.set("filters", JSON.stringify(opts.filters));
  p.set("limit_page_length", String(opts.limit ?? 0));
  if (opts.orderBy) p.set("order_by", opts.orderBy);
  if (opts.parent) p.set("parent", opts.parent);
  const r = await request<{ data: T[] }>(`/resource/${encodeURIComponent(doctype)}?${p}`);
  return r.data;
}
export async function getDoc<T = Record<string, unknown>>(doctype: string, name: string): Promise<T> {
  const r = await request<{ data: T }>(
    `/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
  );
  return r.data;
}
export async function createDoc<T = Record<string, unknown>>(
  doctype: string,
  doc: Record<string, unknown>,
): Promise<T> {
  const r = await request<{ data: T }>(`/resource/${encodeURIComponent(doctype)}`, {
    method: "POST",
    body: JSON.stringify(doc),
  });
  return r.data;
}
export async function updateDoc<T = Record<string, unknown>>(
  doctype: string,
  name: string,
  patch: Record<string, unknown>,
): Promise<T> {
  const r = await request<{ data: T }>(
    `/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`,
    {
      method: "PUT",
      body: JSON.stringify(patch),
    },
  );
  return r.data;
}
export async function deleteDoc(doctype: string, name: string): Promise<void> {
  await request(`/resource/${encodeURIComponent(doctype)}/${encodeURIComponent(name)}`, { method: "DELETE" });
}

// Attachments round-trip as a JSON array in the doc's `attachments` text field. Each entry
// is {name, url}; legacy rows stored a bare filename string, so coerce those to {name,url:""}.
function unpackAttachments(s?: string): Attachment[] | undefined {
  if (!s) return undefined;
  try {
    const a = JSON.parse(s);
    if (!Array.isArray(a) || !a.length) return undefined;
    return a.map((x): Attachment =>
      typeof x === "string" ? { name: x, url: "" } : { name: x?.name ?? "file", url: x?.url ?? "" },
    );
  } catch {
    return undefined;
  }
}

/** Map a Frappe file URL to a same-origin, permission-checked path through the Next proxy.
 *  Private files (/private/files/…) are gated by the attached ticket's tenant permission. */
export function attachmentHref(url: string): string {
  if (!url) return "#";
  if (url.startsWith("/private/files/"))
    return "/api/frappe/private-files/" + url.slice("/private/files/".length);
  if (url.startsWith("/files/")) return "/frappe-files/" + url.slice("/files/".length);
  return url;
}

// ---- shape mappers (Frappe doc <-> frontend types) ------------------------
export interface RawTicket {
  name: string;
  title: string;
  ticket_type: TicketType;
  priority: Priority;
  status: Status;
  client?: string;
  division?: string;
  product?: string;
  raised_by?: string;
  assignee?: string;
  assignment_group?: string;
  owner?: string;
  due_date?: string;
  sla_risk?: 0 | 1;
  description?: string;
  attachments?: string;
  source?: "Portal" | "Email" | "Manual" | "API";
  sender_kind?: "Registered" | "Known Contact" | "Unregistered" | "No Reply";
  no_reply_reason?: string;
  first_response_notified_on?: string;
  from_email?: string;
  creation?: string;
  modified?: string;
  conversation?: {
    kind: "client" | "team";
    author: string;
    role: string;
    message_on: string;
    body: string;
    attachments?: string;
  }[];
  collaborators?: {
    party_type: "Team" | "Member";
    team?: string;
    member?: string;
    added_by?: string;
    added_on?: string;
  }[];
  notes?: { author: string; note_on: string; body: string; attachments?: string }[];
  /** Absent for a client POC read — the backend strips permlevel-1 fields, so this
   *  comes back as an empty list rather than the real log. */
  activity?: {
    action: Activity["action"];
    old_value?: string;
    new_value?: string;
    author: string;
    acted_on: string;
  }[];
}

const MONTHS_LONG = [
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

/** Conversation/note stamp: Datetime ("2026-07-10 09:14:00") -> "10 July 2026, 9:14 AM".
 *  Non-parseable values (legacy pre-formatted strings) pass through unchanged. */
function fmtStamp(value?: string): string {
  if (!value) return "—";
  const d = new Date(value.replace(" ", "T"));
  return isNaN(d.getTime()) ? value : fmtDateTime(d);
}

// Matches a Date-fieldtype value with no time component ("2026-07-10").
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** Format a Date-fieldtype value ("2026-07-10") or a Datetime value
 *  ("2026-07-10 09:14:00[.ffffff]") as "10 July 2026".
 *
 *  Date-only strings are handled by splitting the string, not `new Date()`: per
 *  the ISO-8601 grammar, a date-only string with no timezone parses as UTC
 *  midnight, while a date-*time* string with no timezone parses as local time —
 *  so `new Date("2026-07-10")` would render a day early for any viewer west of
 *  UTC. Full datetimes keep going through `new Date()`, which is correct there. */
function fmtDay(iso?: string): string {
  if (!iso) return "—";
  if (DATE_ONLY.test(iso)) {
    const [y, m, day] = iso.split("-").map(Number);
    return `${day} ${MONTHS_LONG[m - 1]} ${y}`;
  }
  const d = new Date(iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}
function ageFrom(iso?: string): string {
  if (!iso) return "0d";
  const d = new Date(iso.replace(" ", "T"));
  const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
  return `${days}d`;
}

/** Map a Frappe Support Ticket to the frontend Ticket. `divName` resolves the
 *  division docname (e.g. "Thermax-HTG") to its display name ("Heating"). */
export function toTicket(r: RawTicket, divName: (docname?: string) => string): Ticket {
  return {
    id: r.name,
    type: r.ticket_type,
    priority: r.priority,
    status: r.status,
    title: r.title,
    client: r.client || "—",
    div: r.division ? divName(r.division) : "—",
    // Left undefined rather than the em-dash placeholder: this one IS read as data (the
    // Product filter tests it), so a display string here would become a phantom product.
    product: r.product || undefined,
    raisedBy: r.raised_by || "—",
    assignee: r.assignee || "Unassigned",
    group: r.assignment_group || undefined,
    owner: r.owner || undefined,
    collaborators: (r.collaborators || []).map<Collaborator>((c) => ({
      partyType: c.party_type,
      party: c.party_type === "Team" ? c.team || "" : c.member || "",
      addedBy: c.added_by || undefined,
      addedOn: c.added_on ? fmtStamp(c.added_on) : undefined,
    })),
    // Full 12-hour datetime ("10 July 2026, 9:14 AM") everywhere a ticket's created
    // stamp shows; createdISO stays the raw source of truth for trend/age math.
    created: fmtStamp(r.creation),
    createdISO: r.creation,
    updated: fmtStamp(r.modified),
    updatedISO: r.modified,
    updatedAgo: relativeAge(r.modified),
    due: fmtDay(r.due_date),
    age: ageFrom(r.creation),
    slaRisk: !!r.sla_risk,
    // NO_VALUE, not a bare "—": keepHydratedDetail compares against this exact constant to
    // tell "the list did not fetch a description" from "there genuinely isn't one", and a
    // second literal that drifted would silently stop that working.
    desc: r.description || NO_VALUE,
    attachments: unpackAttachments(r.attachments) || [],
    conversation: (r.conversation || []).map<Message>((m) => ({
      kind: m.kind,
      author: m.author,
      role: m.role,
      tm: fmtStamp(m.message_on),
      body: m.body,
      attachments: unpackAttachments(m.attachments),
    })),
    notes: (r.notes || []).map<WorkNote>((n) => ({
      author: n.author,
      tm: fmtStamp(n.note_on),
      body: n.body,
      attachments: unpackAttachments(n.attachments),
    })),
    activity: (r.activity || []).map<Activity>((a) => ({
      action: a.action,
      from: a.old_value || undefined,
      to: a.new_value || undefined,
      author: a.author,
      tm: fmtStamp(a.acted_on),
    })),
    source: r.source,
    senderKind: r.sender_kind,
    noReplyReason: r.no_reply_reason,
    firstResponseEmailedOn: r.first_response_notified_on,
    fromEmail: r.from_email,
  };
}

/** Frappe's own row timestamps. They are NOT in the default field set, so every list
 *  that wants to offer "Newest" / "Recently updated" has to ask for them by name. */
export interface RawStamps {
  creation?: string;
  modified?: string;
}

/** Frappe's snake_case stamps → the camelCase pair the UI types carry. */
export const toStamps = (r: RawStamps): Stamped => ({
  createdISO: r.creation,
  updatedISO: r.modified,
});

export interface RawClient extends RawStamps {
  name: string;
  client_code: string;
  status?: ClientStatus;
  since?: string;
}
export interface RawClientProduct {
  name: string;
  client: string;
  product: string;
  dev_start?: string | null;
  expected_completion?: string | null;
}
/** A row of any of our child tables that just links a division. */
export interface RawChildDivision {
  parent: string;
  division: string;
}
export interface RawDivision {
  name: string;
  division_name: string;
  division_code: string;
  client: string;
}
export interface RawPoc extends RawStamps {
  name: string;
  poc_name: string;
  email: string;
  phone?: string | null;
  is_lead?: 0 | 1;
  client: string;
  /** Legacy single division. The divisions child table is the real scope — this is only
   *  still populated so the backend migration can be rolled back. Do not read it. */
  division?: string;
  user?: string;
  invited_on?: string | null;
}
export interface RawUser {
  name: string;
  last_login?: string | null;
  enabled?: 0 | 1;
}

/** Derive a POC's portal state from its linked User. A missing or disabled user
 *  reads as "none" so the admin can (re-)invite. "Active" means they actually signed
 *  in *after* we last invited them: we compare the User's last_login against the POC's
 *  invited_on. That guard matters because an invite re-uses a pre-existing User whose
 *  last_login may predate this invite — plain "has ever logged in" would wrongly read
 *  as active. Both timestamps come from the same server in fixed "YYYY-MM-DD HH:MM:SS"
 *  form, so a lexical compare orders them correctly. Legacy POCs with no invited_on
 *  fall back to "logged in at all → active". */
export function pocPortalStatus(poc: RawPoc, users: Map<string, RawUser>): PortalStatus {
  if (!poc.user) return "none";
  const u = users.get(poc.user);
  if (!u || u.enabled === 0) return "none";
  if (!u.last_login) return "invited";
  if (poc.invited_on && u.last_login <= poc.invited_on) return "invited";
  return "active";
}

/** Group child rows by their parent docname, taking `key` as the value.
 *
 *  Generic because three child tables need exactly this shape now — POC Division, Client
 *  Product Division and Assignment Group Member — and they differ only in which column
 *  carries the value. */
function byParent<T extends { parent: string }>(rows: T[], key: keyof T): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows) {
    const value = r[key];
    if (typeof value !== "string" || !value) continue;
    const list = m.get(r.parent);
    if (list) list.push(value);
    else m.set(r.parent, [value]);
  }
  return m;
}

/** Assemble the nested Client[] (divisions + contacts + products) the frontend expects.
 *
 *  A contact holds a SET of divisions, so one person legitimately appears under several
 *  division cards — that is the multi-division Lead, not a duplicate. Contacts holding no
 *  division at all are surfaced as `client.leads`: a Lead created during onboarding, before
 *  anyone assigned them anything. Without that they would exist in the database and be
 *  invisible on the page, with no way to assign them.
 *
 *  `users` maps a contact's linked User → its login state (admin view; empty otherwise). */
export function assembleClients(
  clients: RawClient[],
  divisions: RawDivision[],
  pocs: RawPoc[],
  users: Map<string, RawUser> = new Map(),
  pocDivisions: RawChildDivision[] = [],
  clientProducts: RawClientProduct[] = [],
  productDivisions: RawChildDivision[] = [],
): Client[] {
  const pocDivs = byParent(pocDivisions, "division");
  const prodDivs = byParent(productDivisions, "division");

  const toPoc = (p: RawPoc): Poc => ({
    id: p.name,
    name: p.poc_name,
    email: p.email,
    phone: p.phone || undefined,
    isLead: !!p.is_lead,
    divisions: pocDivs.get(p.name) ?? [],
    portal: pocPortalStatus(p, users),
    ...toStamps(p),
  });

  return clients.map((c) => {
    const mine = pocs.filter((p) => p.client === c.name).map(toPoc);
    return {
      ...toStamps(c),
      name: c.name,
      code: c.client_code,
      status: c.status ?? "Active",
      since: c.since,
      products: clientProducts
        .filter((cp) => cp.client === c.name)
        .map<ClientProduct>((cp) => ({
          id: cp.name,
          product: cp.product,
          devStart: cp.dev_start || undefined,
          expectedCompletion: cp.expected_completion || undefined,
          divisions: prodDivs.get(cp.name) ?? [],
        })),
      // Leads are listed at client level regardless of how many divisions they hold, so
      // they can be found and re-assigned; they also still appear under each division they
      // oversee, which is what makes the division card tell the truth about who sees it.
      leads: mine.filter((p) => p.isLead),
      divisions: divisions
        .filter((d) => d.client === c.name)
        .map<Division>((d) => ({
          name: d.division_name,
          code: d.division_code,
          docname: d.name,
          pocs: mine.filter((p) => p.divisions.includes(d.name)),
        })),
    };
  });
}

export function toMember(
  r: RawStamps & {
    member_name: string;
    email?: string;
    title?: string;
    status?: "Active" | "Invited" | "Not Invited";
  },
): TeamMember {
  return {
    name: r.member_name,
    email: r.email || "—",
    title: r.title || undefined,
    status: r.status || "Not Invited",
    ...toStamps(r),
  };
}
/** A row of the Assignment Group Member child table. */
export interface RawGroupMember {
  parent: string;
  member: string;
}

/** Assemble Group[] from the group list plus ONE flat read of the members child table.
 *
 *  Replaces a getDoc per group. Loading teams cost 1 + N requests, and `reloadMasters()`
 *  runs after almost every mutation in the store — adding a member, renaming a client,
 *  inviting a POC — so the N was paid on each of them, not just at login.
 *
 *  The `parent` option on the list endpoint is what makes the single read possible: child
 *  rows are permission-checked through their parent, so Frappe needs telling which parent
 *  doctype to check against. Same technique already used for POC Division above. */
export function assembleGroups(
  groups: (RawStamps & { name: string; group_name?: string })[],
  memberRows: RawGroupMember[] = [],
): Group[] {
  const members = byParent(memberRows, "member");
  return groups.map((g) => ({
    // Assignment Group is autonamed by group_name, so these agree — but read the field
    // rather than relying on that, since the docname is what the child rows join on.
    name: g.group_name || g.name,
    members: members.get(g.name) ?? [],
    ...toStamps(g),
  }));
}
