export type Role = "admin" | "client";

export type TicketType = "Bug" | "Query" | "Improvement" | "New Feature";
export type Priority = "Critical" | "High" | "Medium" | "Low";
export type Status =
  "New" | "Acknowledged" | "In Progress" | "Pending Client" | "Resolved" | "Closed" | "Reopened";
/** Portal login state for a POC: none = no account yet, invited = account created
 *  but never signed in, active = has signed in at least once. */
export type PortalStatus = "none" | "invited" | "active";

/** A file attached to a ticket, message or note. `url` is the Frappe private-file path
 *  (/private/files/…); render it through `attachmentHref()` for a same-origin,
 *  permission-checked download. Legacy rows may carry a name with an empty url. */
export interface Attachment {
  name: string;
  url: string;
}

/** A person on the client side. Two flavours, one shape:
 *  - a division POC, holding the one division they belong to;
 *  - a Lead, created during client onboarding to oversee divisions.
 *  A Lead starts with `divisions` empty, which means no ticket access at all — access is
 *  only ever granted by assigning divisions. */
/** Server timestamps, carried on records loaded from the backend so a list can offer
 *  "Newest" and "Recently updated" without a second request. Optional because records
 *  built locally (fixtures, a row assembled before its first save) have none yet — every
 *  comparator therefore has to treat a missing stamp as "oldest", not as an error. */
export interface Stamped {
  createdISO?: string;
  updatedISO?: string;
}

/** A catalogue product. This was a bare string until list sorting needed its dates. */
export interface Product extends Stamped {
  name: string;
}

export interface Poc extends Stamped {
  /** POC docname — set on POCs loaded from the backend; needed to edit/delete. */
  id?: string;
  name: string;
  email: string;
  phone?: string;
  /** Created at client level and oversees divisions, rather than belonging to one. */
  isLead: boolean;
  /** Division docnames this person can see. Empty = no ticket access yet. */
  divisions: string[];
  /** State of this POC's portal login (admin view only). */
  portal?: PortalStatus;
}

/** An Inventive team member a ticket can be assigned to. */
export interface TeamMember extends Stamped {
  name: string;
  email: string;
  /** Job title, e.g. "Software Dev". */
  title?: string;
  /** Active = password set up; Invited = portal invite sent, awaiting setup. */
  status: "Active" | "Invited" | "Not Invited";
}

/** A custom group of team members (e.g. "Structural Team", "IT Team"). */
export interface Group extends Stamped {
  name: string;
  members: string[]; // member names
}

export interface Division {
  /** Display name, e.g. "Boiler". */
  name: string;
  code: string;
  /** Division docname ("Thermax-BOI") — what tickets and contacts actually link to. */
  docname?: string;
  pocs: Poc[];
}

/** Where a client is in its relationship with Inventive. */
export type ClientStatus = "Onboarding" | "Active" | "On Hold" | "Churned";

/** A product Inventive runs for a client — the engagement, with its own dates.
 *  `divisions` empty means it's attached to the client as a whole, which is the only
 *  shape available to a client with no divisions and a valid choice for one with them. */
export interface ClientProduct {
  id: string;
  product: string;
  devStart?: string;
  expectedCompletion?: string;
  divisions: string[];
}

export interface Client extends Stamped {
  name: string;
  code: string;
  status: ClientStatus;
  /** Date Inventive onboarded this client. */
  since?: string;
  /** The products this client runs, as engagements — each with its own dates and the
   *  divisions it covers. This is the ONLY product relationship; the backend still has a
   *  legacy `Client.product` column, populated for rollback and read by nothing. */
  products: ClientProduct[];
  /** Leads: client-level contacts, not attached to any one division. */
  leads: Poc[];
  divisions: Division[];
}

export interface Message {
  kind: "client" | "team";
  author: string;
  role: string;
  tm: string;
  body: string;
  attachments?: Attachment[];
}

export interface WorkNote {
  author: string;
  tm: string;
  body: string;
  attachments?: Attachment[];
}

/** One entry in a ticket's activity log — who changed what, and when. Written
 *  server-side only (SupportTicket.before_save); the backend keeps it at permlevel 1,
 *  so a client POC's ticket read comes back with this list empty. */
export interface Activity {
  action: "Created" | "Status" | "Priority" | "Assignee" | "Team" | "Collaborator";
  from?: string;
  to?: string;
  author: string;
  tm: string;
}

/** A team or member looped in to coordinate on a ticket without owning it
 *  ("Collaborators"). They gain read access and can post internal notes. */
export interface Collaborator {
  partyType: "Team" | "Member";
  /** The team (Assignment Group) or member (Team Member) name this points at. */
  party: string;
  addedBy?: string;
  addedOn?: string;
}

export interface Ticket {
  id: string;
  type: TicketType;
  priority: Priority;
  status: Status;
  title: string;
  client: string;
  div: string;
  /** The product this ticket is about. Exactly one, or none for an emailed-in ticket
   *  nobody has tagged yet. Single value by design — see Support Ticket.product. */
  product?: string;
  raisedBy: string;
  assignee: string;
  /** Assignment group (e.g. "IT Team") the ticket is routed to. */
  group?: string;
  /** Frappe `owner` — the login (email) that created the ticket. Distinguishes an
   *  agent's own raised tickets from ones they merely collaborate on. */
  owner?: string;
  /** Extra teams/members looped in to coordinate (see Collaborator). */
  collaborators: Collaborator[];
  created: string;
  /** Raw ISO creation timestamp (source of truth for trend math / age). */
  createdISO?: string;
  /** Display "last updated" timestamp (12-hour), from the doc's Frappe `modified`
   *  — bumps on every ticket change (status, assignment, message, note). */
  updated?: string;
  /** Raw ISO last-updated timestamp. */
  updatedISO?: string;
  /** Compact relative recency ("2h", "3d") for the list. Computed when the ticket is
   *  mapped, not when it is rendered — see relativeAge. */
  updatedAgo?: string;
  due: string;
  age: string;
  slaRisk: boolean;
  desc: string;
  attachments: Attachment[];
  conversation: Message[];
  notes: WorkNote[];
  activity: Activity[];
  /** How the ticket was raised. Undefined = legacy/portal. */
  source?: "Portal" | "Email" | "Manual" | "API";
  /** Who is on the other end, derived server-side by sender.classify(). Governs whether a
   *  reply can reach them at all, and whether the portal is an option. */
  senderKind?: "Registered" | "Known Contact" | "Unregistered" | "No Reply";
  /** Set only for "No Reply" — which rule or pattern matched, so the badge can explain itself. */
  noReplyReason?: string;
  /** When a staff reply was first emailed to this client. Unset means they have never had
   *  one, which is what makes the next reply go out even with the email toggle off. */
  firstResponseEmailedOn?: string;
  /** Sender address when raised via email. */
  fromEmail?: string;
}

export interface Session {
  role: Role;
  /** Staff only: true = manager (can manage the org), false = agent (tickets only). */
  manage: boolean;
  /** May DELEGATE manager access to others. Narrower than `manage`: a delegated manager
   *  runs the whole org but cannot promote anyone, so admin never spreads on its own. */
  isOwner: boolean;
  name: string;
  /** The signed-in user's Frappe login (email) — identifies "tickets I raised". */
  user?: string;
  /** Staff only: the agent's Team Member docname — matches ticket.assignee, so it's
   *  how "assigned to me" / "my team's queue" views are built. */
  member?: string;
  /** Staff only: the teams (assignment groups) this agent belongs to. */
  teams?: string[];
  /** Staff only: the member's job title, shown under their name in the sidebar. */
  title?: string;
  client?: string;
  /** Client only: FIRST division's display name. Kept for views that show one label;
   *  never use it to decide what a contact may see — that is `divisions`. */
  div?: string;
  /** Client only: every division docname this contact holds. Empty means no ticket
   *  access at all, which is how a lead starts before anyone assigns them. */
  divisions?: string[];
}

export interface RaiseTicketInput {
  type: TicketType;
  priority: Priority;
  title: string;
  desc: string;
  client: string;
  div: string;
  /** Chosen from the products running at `div`; omitted when that division runs none. */
  product?: string;
  raisedBy: string;
  files: File[];
}
