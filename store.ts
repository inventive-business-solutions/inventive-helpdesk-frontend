import { create } from "zustand";
import type {
  Client,
  ClientStatus,
  Collaborator,
  Group,
  Message,
  Poc,
  Priority,
  Product,
  RaiseTicketInput,
  Role,
  Session,
  Status,
  TeamMember,
  Ticket,
  WorkNote,
} from "./types";
import * as api from "./lib/frappe";
import { NO_VALUE, chunk, makeCode } from "./lib/helpers";
import { clearStoredSorts } from "./lib/listview";

// Marks that an app session is live in THIS browser tab. sessionStorage survives
// in-tab reloads (F5) but not a tab close or a new tab — so a fresh open of the
// tool always starts at /login (restore() bails), while a plain refresh keeps you
// signed in. Wrapped in try/catch so a locked-down store (private mode) just
// degrades to "always require login" instead of throwing on boot.
const TAB_SESSION_KEY = "ic.tab-session";
const markTabSession = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(TAB_SESSION_KEY, "1");
    else sessionStorage.removeItem(TAB_SESSION_KEY);
  } catch {
    /* storage unavailable — auth still works, it just won't persist across F5 */
  }
};
const hasTabSession = () => {
  try {
    return sessionStorage.getItem(TAB_SESSION_KEY) === "1";
  } catch {
    return false;
  }
};

type DivRef = { docname: string; name: string; code: string; client: string };

/** Resolve a Division docname (e.g. "Thermax-HTG") to its display name ("Heating"). */
const resolver = (divIndex: DivRef[]) => (docname?: string) =>
  divIndex.find((x) => x.docname === docname)?.name ?? docname ?? "—";

/** Team Members and Assignment Groups — the "who works here" half of master data.
 *
 *  Split out because it is genuinely independent: assembleClients takes clients,
 *  divisions, POCs and products, and touches neither of these. So a purely-team mutation
 *  (adding a member, moving someone between groups) can refresh just this instead of
 *  refetching every client, division, contact, linked User and engagement along with it.
 *
 *  That mattered because reloadMasters() runs after almost every mutation in this store —
 *  22 call sites — and each one was ~11 queries regardless of what actually changed. */
async function fetchTeam() {
  const [members, groups] = await Promise.all([
    api
      .getList<{ member_name: string; email?: string; title?: string; status?: TeamMember["status"] }>(
        "Team Member",
        {
          fields: ["name", "member_name", "email", "title", "status", "creation", "modified"],
          limit: MASTER_FETCH_CAP,
          orderBy: "member_name asc",
        },
      )
      .then((rows) => rows.map(api.toMember)),
    // Two list calls, not 1 + N. This used to fetch the group names and then a full
    // getDoc per group purely to read its members child table.
    (async () => {
      const [gnames, memberRows] = await Promise.all([
        api.getList<api.RawStamps & { name: string; group_name: string }>("Assignment Group", {
          fields: ["name", "group_name", "creation", "modified"],
          limit: MASTER_FETCH_CAP,
        }),
        // `idx asc` preserves the order the child table stores them in, which is what
        // the per-group getDoc used to return; grouping by parent keeps that order
        // within each group.
        api.getList<api.RawGroupMember>("Assignment Group Member", {
          fields: ["parent", "member"],
          parent: "Assignment Group",
          limit: CHILD_FETCH_CAP,
          orderBy: "idx asc",
        }),
      ]);
      return api.assembleGroups(gnames, memberRows);
    })(),
  ]);
  return { members, groups };
}

/** Load master data (clients/divisions/pocs + team/groups for admins) for the
 *  role. The backend scopes everything, so a client only receives their own. */
async function fetchMasters(role: Role) {
  const [rawClients, rawDivs] = await Promise.all([
    api.getList<api.RawClient>("Client", {
      // No `product`: the legacy single-product column is no longer read anywhere. A
      // client's products come from the Client Product engagements fetched below.
      // `creation`/`modified` are not in Frappe's default field set and have to be asked
      // for by name; the list toolbar sorts on them.
      fields: ["name", "client_code", "status", "since", "creation", "modified"],
      limit: MASTER_FETCH_CAP,
    }),
    api.getList<api.RawDivision>("Division", {
      fields: ["name", "division_name", "division_code", "client"],
      limit: MASTER_FETCH_CAP,
    }),
  ]);

  let rawPocs: api.RawPoc[] = [];
  let pocDivisions: api.RawChildDivision[] = [];
  let clientProducts: api.RawClientProduct[] = [];
  let productDivisions: api.RawChildDivision[] = [];
  let members: TeamMember[] = [];
  let groups: Group[] = [];
  let products: Product[] = [];
  let users = new Map<string, api.RawUser>();
  if (role === "admin") {
    // POCs, products, members and groups are mutually independent — fetch them
    // concurrently so login/reload latency is the slowest call, not their sum.
    const [pocData, productNames, team, productData] = await Promise.all([
      // POCs plus each linked User's portal-login state. Best-effort on the User
      // list: if it isn't readable the page still loads, POCs just show no account.
      (async () => {
        const raw = await api.getList<api.RawPoc>("POC", {
          fields: [
            "name",
            "poc_name",
            "email",
            "phone",
            "is_lead",
            "client",
            "user",
            "invited_on",
            "creation",
            "modified",
          ],
          limit: MASTER_FETCH_CAP,
        });
        let map = new Map<string, api.RawUser>();
        const userEmails = [...new Set(raw.map((p) => p.user).filter(Boolean) as string[])];
        if (userEmails.length) {
          // Batched, not one request. This filter travels in the URL, and every contact's
          // email went into it — past ~170 contacts the query string crossed the 8KB header
          // buffer nginx and Traefik default to, the request 414'd, and the catch below
          // turned that into "nobody has portal access". Wrong data, silently, with no
          // error anywhere. Each batch is now a few hundred bytes.
          const batches = await Promise.all(
            chunk(userEmails, USER_LOOKUP_BATCH).map((emails) =>
              api
                .getList<api.RawUser>("User", {
                  fields: ["name", "last_login", "enabled"],
                  filters: [["name", "in", emails]],
                  limit: MASTER_FETCH_CAP,
                })
                // Per batch, so one failure costs that batch's contacts rather than
                // blanking the portal status of every contact on the page.
                .catch(() => [] as api.RawUser[]),
            ),
          );
          map = new Map(batches.flat().map((u) => [u.name, u]));
        }
        // One list call for every contact's divisions, not a getDoc per contact — the
        // `parent` option exists for exactly this. Best-effort like the User lookup: a
        // failure here must not blank the Clients page, it just shows contacts unassigned.
        let divRows: api.RawChildDivision[] = [];
        try {
          divRows = await api.getList<api.RawChildDivision>("POC Division", {
            fields: ["parent", "division"],
            parent: "POC",
            limit: CHILD_FETCH_CAP,
          });
        } catch {
          /* leave contacts showing no divisions rather than failing the page */
        }
        return { raw, users: map, divRows };
      })(),
      api
        .getList<api.RawStamps & { name: string }>("Product", {
          fields: ["name", "creation", "modified"],
          limit: MASTER_FETCH_CAP,
          orderBy: "product_name asc",
        })
        .then((prod) => prod.map<Product>((p) => ({ name: p.name, ...api.toStamps(p) }))),
      fetchTeam(),
      // Client products (the engagements) plus the divisions each is attached to.
      (async () => {
        const rows = await api.getList<api.RawClientProduct>("Client Product", {
          fields: ["name", "client", "product", "dev_start", "expected_completion"],
          limit: MASTER_FETCH_CAP,
        });
        let divRows: api.RawChildDivision[] = [];
        try {
          divRows = await api.getList<api.RawChildDivision>("Client Product Division", {
            fields: ["parent", "division"],
            parent: "Client Product",
            limit: CHILD_FETCH_CAP,
          });
        } catch {
          /* products then read as client-wide, which is the safe default */
        }
        return { rows, divRows };
      })(),
    ]);
    rawPocs = pocData.raw;
    users = pocData.users;
    pocDivisions = pocData.divRows;
    products = productNames;
    members = team.members;
    groups = team.groups;
    clientProducts = productData.rows;
    productDivisions = productData.divRows;
  }

  const clients = api.assembleClients(
    rawClients,
    rawDivs,
    rawPocs,
    users,
    pocDivisions,
    clientProducts,
    productDivisions,
  );
  const divIndex: DivRef[] = rawDivs.map((d) => ({
    docname: d.name,
    name: d.division_name,
    code: d.division_code,
    client: d.client,
  }));
  // Any list that came back exactly full is presumed cut short. Reported rather than
  // swallowed: a silently truncated client list makes every count on the page wrong, and
  // the only symptom would be a record someone swears exists not being there.
  const mastersTruncated =
    rawClients.length >= MASTER_FETCH_CAP ||
    rawDivs.length >= MASTER_FETCH_CAP ||
    rawPocs.length >= MASTER_FETCH_CAP ||
    clientProducts.length >= MASTER_FETCH_CAP ||
    products.length >= MASTER_FETCH_CAP ||
    members.length >= MASTER_FETCH_CAP ||
    groups.length >= MASTER_FETCH_CAP;
  return { clients, members, groups, products, divIndex, mastersTruncated };
}

// Top-level ticket fields the list/dashboard views need. Child tables
// (conversation/notes) are intentionally omitted here and loaded per-ticket on
// the detail page — one list request instead of the old 1 + N getDoc fan-out.
const TICKET_LIST_FIELDS = [
  "name",
  "title",
  "ticket_type",
  "priority",
  "status",
  "client",
  "division",
  "product",
  "raised_by",
  "assignee",
  "assignment_group",
  "owner",
  "due_date",
  "sla_risk",
  // `description` is deliberately NOT here. It is rendered in exactly one place — the
  // detail view — which loads the full document anyway, while the list fetched it for
  // every ticket on every 30-second poll. No filter, sort or column reads it: every
  // predicate in Tickets.tsx tests a scalar field.
  //
  // It is also the largest field on the doctype by a wide margin. Email intake stores up
  // to 100,000 characters of message body (email.py:466), so on an inbox-heavy site this
  // was most of the payload, repeated per poll per agent, to render nothing.
  //
  // Dropping it means every list row now carries the "—" placeholder, which is why
  // keepHydratedDetail has to preserve a real one — see there.
  "source",
  "from_email",
  "sender_kind",
  "no_reply_reason",
  "first_response_notified_on",
  "creation",
  "modified",
];

/** The tenant scope a session may read, or undefined for staff (who are scoped per agent
 *  by the server instead). Exported for tests: this and ticketScopeFilters below are the
 *  browser half of tenant isolation, and both are silent when wrong. */
export const scopeFor = (session: Session | null) =>
  session?.role === "client" ? { client: session.client, divisions: session.divisions ?? [] } : undefined;

/** Ceiling on one ticket fetch.
 *
 *  This was `limit: 0` — Frappe's "no limit" — so the browser pulled every ticket the user
 *  could see, on login and on every 30-second poll. For a manager, whose scope is the whole
 *  site, that grows without bound for the life of the deployment, and every filter, sort and
 *  dashboard count then runs over that array in memory.
 *
 *  A cap is NOT the same as server-side pagination, and is not pretending to be. Filtering
 *  and aggregation still happen client-side, so the honest description is that this bounds
 *  the worst case rather than fixing the design. It is set well above any plausible current
 *  volume so nothing changes in practice today; the point is that the failure mode at ten
 *  times the volume becomes "the oldest tickets are not in this view", which is visible and
 *  survivable, rather than a page that gets slower every month until it stops loading.
 *
 *  Ordered `creation desc`, so what falls off the end is the oldest — and `truncated` is
 *  reported to the UI rather than swallowed, because a list quietly missing rows is worse
 *  than a slow one. Proper pagination is the real fix; see the note in the store. */
export const TICKET_FETCH_CAP = 2000;

/** Ceiling on each master-data list. These were all `limit: 0` — Frappe's "no limit" — so
 *  the browser pulled every client, division, contact, product and engagement on login AND
 *  after almost every mutation, with nothing to stop it. A cap turns "eventually the app
 *  stops loading" into a bounded payload plus a visible notice. */
export const MASTER_FETCH_CAP = 2000;
/** Child tables are rows-PER-parent — a division link per contact, per engagement — so they
 *  legitimately outnumber their parents several times over and need more headroom. */
export const CHILD_FETCH_CAP = 10000;

/** Emails per `["name","in",…]` batch when resolving contacts' portal accounts. 100 keeps
 *  the query string near 5KB — comfortably inside the 8KB header buffer nginx and Traefik
 *  default to, with room for the rest of the URL. */
const USER_LOOKUP_BATCH = 100;

/** The list filters a session may query tickets with.
 *
 *  Defense-in-depth: a client session asks only for its own client's tickets, and only the
 *  divisions it actually holds. The backend already scopes this server-side
 *  (permission_query_conditions); these filters ensure a regression there cannot spill
 *  another tenant's tickets into the browser store. Staff sessions pass no scope, because
 *  the server scopes them per agent and the browser cannot know that scope.
 *
 *  A contact with NO divisions asks for NOTHING rather than everything — mirroring the
 *  server, where an empty scope denies. Getting that inverted here would defeat the whole
 *  point of the second layer: `["division", "in", []]` matches no row, while omitting the
 *  filter matches every row the server is willing to return.
 *
 *  Extracted from fetchTickets so it can be tested without a network round trip. A second
 *  layer that is wrong is worse than no second layer, because it reads as protection. */
export function ticketScopeFilters(scope?: { client?: string; divisions?: string[] }): unknown[] {
  if (!scope?.client) return [];
  return [
    ["client", "=", scope.client],
    ["division", "in", scope.divisions ?? []],
  ];
}

/** Load the (scoped) tickets in a single list call. Kept separate so
 *  master-data edits don't refetch the whole ticket set.
 *
 *  Returns `truncated` when the fetch came back full, i.e. there are older tickets this
 *  view is not showing. */
async function fetchTickets(divIndex: DivRef[], scope?: { client?: string; divisions?: string[] }) {
  const resolve = resolver(divIndex);
  const filters = ticketScopeFilters(scope);
  const rows = await api.getList<api.RawTicket>("Support Ticket", {
    fields: TICKET_LIST_FIELDS,
    orderBy: "creation desc",
    limit: TICKET_FETCH_CAP,
    ...(filters.length ? { filters } : {}),
  });
  return {
    tickets: rows.map((d) => api.toTicket(d, resolve)),
    // `>=` rather than `===`: a server-side default could return fewer than asked for
    // without meaning the set is complete, and under-reporting truncation is the failure
    // this flag exists to prevent.
    truncated: rows.length >= TICKET_FETCH_CAP,
  };
}

/** Carry already-hydrated detail across a LIST refresh.
 *
 *  The list fetch returns no child tables, so every ticket it produces has empty
 *  conversation/notes/activity. Dropping those onto an open ticket detail blanks it
 *  for a beat on every 30s poll — a visible flicker. This keeps whatever the previous
 *  copy had; detail navigation re-hydrates fully via loadTicket.
 *
 *  ADDING A CHILD TABLE TO `Ticket` MEANS ADDING IT HERE. This was a hardcoded pair
 *  (conversation, notes) in two separate places, and adding `activity` silently
 *  reintroduced exactly the flicker the merge exists to prevent — hence one helper. */
export function keepHydratedDetail(fresh: Ticket[], prev: Ticket[]): Ticket[] {
  const byId = new Map(prev.map((t) => [t.id, t]));
  return fresh.map((t) => {
    const old = byId.get(t.id);
    if (!old) return t;
    // `description` is not in the list fetch, so every list row arrives with the "—"
    // placeholder. Without this an open detail view would revert to "—" on each poll
    // while the user was reading it — the same defect this helper exists to prevent,
    // arriving by a different route.
    //
    // Kept separate from the child-table check below rather than folded into it: a client
    // POC reads notes and activity at permlevel 1, so both come back empty for them, and
    // a ticket with no reply yet has an empty conversation too. Gating the description on
    // `hydrated` would therefore restore it for staff and not for the portal, which is
    // the harder bug to notice of the two.
    const desc = t.desc === NO_VALUE && old.desc !== NO_VALUE ? old.desc : t.desc;
    const hydrated = old.conversation.length || old.notes.length || old.activity.length;
    return hydrated
      ? { ...t, desc, conversation: old.conversation, notes: old.notes, activity: old.activity }
      : { ...t, desc };
  });
}

/** What the server actually did with a reply — see sender.reply_plan. `emailed` is the
 *  outcome, not the request: the toggle is ignored for senders with no portal. */
export interface ReplyResult {
  ticket: string;
  emailed: boolean;
  detail: string;
}

/** Order-independent identity of a collaborator set, so two lists compare by value. */
export const collabKey = (cs: Collaborator[]) =>
  cs
    .map((c) => `${c.partyType}:${c.party}`)
    .sort()
    .join("|");

/** The staged (unsaved) ticket edits held in the detail rail. */
export interface TicketDraft {
  group: string;
  assignee: string;
  priority: Priority;
  status: Status;
  /** "" = not classified. Staged like the rest so tagging an emailed-in ticket at triage
   *  saves with the other edits rather than on every keystroke of the dropdown. */
  product: string;
  collaborators: Collaborator[];
}

/** Merge freshly-arrived server values into a draft the user may be part-way through
 *  editing — PER FIELD.
 *
 *  A blanket `setDraft(server)` looks right and is not: the detail view re-syncs whenever
 *  ANY server field changes, so a teammate flipping priority (or the 30s poll landing)
 *  silently discarded the assignee and collaborators you had staged but not yet saved.
 *
 *  `last` is what the server said at the previous sync, and it is what makes the
 *  distinction possible: a field still equal to `last` is one you never touched, so it
 *  should track the server; a field that differs is your unsaved edit, so it stays. Both
 *  halves matter — keeping everything would let your save revert a teammate's change to a
 *  field you never looked at. `last` is null on the first sync for a ticket (including
 *  after navigating between tickets), where the server simply wins. */
export function mergeTicketDraft(
  draft: TicketDraft,
  last: TicketDraft | null,
  server: TicketDraft,
): TicketDraft {
  if (!last) return server;
  return {
    group: draft.group === last.group ? server.group : draft.group,
    assignee: draft.assignee === last.assignee ? server.assignee : draft.assignee,
    priority: draft.priority === last.priority ? server.priority : draft.priority,
    status: draft.status === last.status ? server.status : draft.status,
    product: draft.product === last.product ? server.product : draft.product,
    collaborators:
      collabKey(draft.collaborators) === collabKey(last.collaborators)
        ? server.collaborators
        : draft.collaborators,
  };
}

/** `Client Product.product` is a Link to the Product doctype, so a name typed into a
 *  dialog must resolve to a real Product. Return the existing Product's docname, creating
 *  it if new — which is what lets the engagement dialogs accept a new product inline. */
async function resolveProduct(name: string): Promise<string> {
  const found = await api.getList<{ name: string }>("Product", {
    fields: ["name"],
    filters: [["product_name", "=", name]],
    limit: 1,
  });
  if (found.length) return found[0].name;
  const doc = await api.createDoc<{ name: string }>("Product", { product_name: name });
  return doc.name;
}

interface Store {
  clients: Client[];
  members: TeamMember[];
  groups: Group[];
  products: Product[];
  tickets: Ticket[];
  /** Ticket ids with a client message or internal note THIS agent hasn't seen. Per agent,
   *  so a teammate opening a ticket doesn't clear your marker. Empty for client sessions —
   *  the endpoint is staff-only. */
  unread: string[];
  /** True when the ticket fetch came back at its cap, i.e. there are older tickets this
   *  session is not holding. Surfaced in the list rather than kept internal: a view that
   *  is quietly missing rows is worse than one that admits it. */
  ticketsTruncated: boolean;
  /** A master list hit MASTER_FETCH_CAP, so the Clients/Products/Team pages are showing a
   *  subset and every derived count on them is a floor, not a total. */
  mastersTruncated: boolean;
  /** Dashboard figures counted server-side, or null before the first load. Kept separate
   *  from `tickets` because it is the whole point: these numbers are complete even when
   *  the ticket array is capped. */
  stats: api.TicketStats | null;
  session: Session | null;
  divIndex: DivRef[];
  booted: boolean;

  signIn: (email: string, pwd: string) => Promise<Session>;
  setPassword: (key: string, newPassword: string) => Promise<Session>;
  restore: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  reloadMasters: () => Promise<void>;
  /** Refresh ONLY Team Members and Assignment Groups. Correct for a mutation that touches
   *  neither clients nor tickets — assembleClients does not read either of them — and
   *  costs two queries instead of the eleven reloadMasters issues. */
  reloadTeam: () => Promise<void>;
  /** Lightweight background refresh: re-fetch just the ticket list (one call), no
   *  masters — used by the auto-refresh poller. */
  refreshTickets: () => Promise<void>;
  /** Re-count the dashboard figures. `weeks` sizes the trend window. */
  refreshStats: (weeks?: number) => Promise<void>;
  loadTicket: (id: string, guarded?: boolean) => Promise<void>;
  /** Clear this agent's unread marker for a ticket (called when they open it). */
  markRead: (id: string) => Promise<void>;

  setStatus: (id: string, status: Status) => Promise<void>;
  setPriority: (id: string, priority: Priority) => Promise<void>;
  /** Tag (or re-tag) a ticket's product — the triage path for emailed-in tickets, which
   *  arrive with none. "" clears it. The backend rejects a product the client doesn't run
   *  at that division, so the picker must be built from availableProducts. */
  setTicketProduct: (id: string, product: string) => Promise<void>;
  setAssignment: (id: string, group: string, assignee: string) => Promise<void>;
  /** Agent self-assigns a ticket from their team's queue (team-first, server-enforced). */
  claimTicket: (id: string) => Promise<void>;
  /** Loop a team/member onto a ticket as a Collaborator. */
  addCollaborator: (id: string, partyType: "Team" | "Member", party: string) => Promise<void>;
  removeCollaborator: (id: string, partyType: "Team" | "Member", party: string) => Promise<void>;
  reopen: (id: string) => Promise<void>;
  addMessage: (id: string, msg: Message, files?: File[], sendEmail?: boolean) => Promise<ReplyResult>;
  addNote: (id: string, note: WorkNote, files?: File[]) => Promise<void>;
  raiseTicket: (input: RaiseTicketInput) => Promise<string>;

  addMember: (name: string, email: string, title: string, invite: boolean, group?: string) => Promise<void>;
  updateMember: (name: string, patch: { name?: string; title?: string; email?: string }) => Promise<void>;
  removeMember: (name: string) => Promise<void>;
  sendInvite: (name: string) => Promise<void>;
  addGroup: (name: string) => Promise<void>;
  removeGroup: (name: string) => Promise<void>;
  addGroupMember: (group: string, member: string) => Promise<void>;
  removeGroupMember: (group: string, member: string) => Promise<void>;

  addClient: (input: {
    name: string;
    since: string;
    status: ClientStatus;
    /** Client-side leads captured during onboarding. They hold no divisions yet — none
     *  exist — so they get no ticket access until assigned from a division. */
    leads?: { name: string; email: string; phone?: string; invite?: boolean }[];
  }) => Promise<void>;
  addPoc: (
    clientName: string,
    /** Division display name, or "" to add the person as a client-level Lead. */
    divName: string,
    poc: { name: string; email: string; phone?: string; invite?: boolean },
  ) => Promise<void>;
  addDivision: (
    clientName: string,
    input: {
      name: string;
      poc?: { name: string; email: string; phone?: string; invite?: boolean } | null;
      /** Existing Leads to grant sight of this division (POC docnames). */
      leads?: string[];
    },
  ) => Promise<void>;
  setLeadDivisions: (leadId: string, divisions: string[]) => Promise<void>;
  addClientProduct: (
    clientName: string,
    input: { product: string; devStart?: string; expectedCompletion?: string; divisions: string[] },
  ) => Promise<void>;
  updateClientProduct: (
    id: string,
    input: { product?: string; devStart?: string; expectedCompletion?: string; divisions?: string[] },
  ) => Promise<void>;
  removeClientProduct: (id: string) => Promise<void>;
  /** Add to the product CATALOGUE. Putting a product into service is an engagement —
   *  addClientProduct — not a field on the client. */
  createProduct: (name: string) => Promise<void>;
  renameProduct: (oldName: string, newName: string) => Promise<void>;
  deleteProduct: (name: string) => Promise<void>;
  updatePoc: (
    pocId: string,
    patch: { name: string; email: string; phone?: string; divisions?: string[] },
  ) => Promise<void>;
  invitePoc: (pocId: string) => Promise<{ user: string; email_sent: boolean }>;
  removePoc: (pocId: string) => Promise<void>;
  updateClient: (
    clientName: string,
    patch: { name: string; code: string; since?: string; status?: ClientStatus },
  ) => Promise<string>;
  removeClient: (clientName: string) => Promise<void>;
  updateDivision: (clientName: string, divName: string, patch: { name: string }) => Promise<void>;
  removeDivision: (clientName: string, divName: string) => Promise<void>;
}

export const useStore = create<Store>()((set, get) => {
  const divDocname = (client: string, name: string) =>
    get().divIndex.find((x) => x.client === client && x.name === name)?.docname;

  /** Re-derive this agent's unread set. Staff only — the endpoint throws PermissionError
   *  for a client POC, and a portal session has no ticket list to mark up anyway. Failures
   *  are swallowed: an unread dot is a convenience, never a reason to break a refresh. */
  /** Everything sign-in does AFTER the password is accepted: read the session, then load
   *  the master data and tickets the app cannot start without.
   *
   *  Split out so signIn can wrap exactly this half in asPostAuthError. Anything that
   *  throws in here happened with valid credentials, so it must never be reported as a
   *  credentials problem. */
  const bootSession = async () => {
    const ctx = await api.me();
    // Authenticated, but with no app role they aren't a valid user of this tool —
    // reject rather than silently admitting them as a client (same guard restore uses).
    if (!ctx || ctx.user === "Guest" || !ctx.role) {
      throw new api.UserError("This account isn't set up for the support app — contact your administrator.");
    }
    api.setCsrfToken(ctx.csrf_token);
    const session = sessionFromCtx(ctx);
    const masters = await fetchMasters(session.role);
    const { tickets, truncated } = await fetchTickets(masters.divIndex, scopeFor(session));
    markTabSession(true); // this tab now holds a live session (survives F5, not tab close)
    set({ session, ...masters, tickets, ticketsTruncated: truncated, booted: true });
    void refreshUnread();
    return session;
  };

  const refreshUnread = async () => {
    if (get().session?.role !== "admin") return;
    try {
      set({ unread: (await api.unreadTickets()) || [] });
    } catch {
      /* leave the previous set in place */
    }
  };

  const upsertTicket = (doc: api.RawTicket) =>
    set((s) => {
      const tk = api.toTicket(doc, resolver(s.divIndex));
      const exists = s.tickets.some((t) => t.id === tk.id);
      return { tickets: exists ? s.tickets.map((t) => (t.id === tk.id ? tk : t)) : [tk, ...s.tickets] };
    });

  const sessionFromCtx = (ctx: api.Me): Session => ({
    role: ctx.role === "admin" ? "admin" : "client",
    manage: !!ctx.manage,
    isOwner: !!ctx.is_owner,
    name: ctx.name || ctx.user,
    user: ctx.user,
    member: ctx.member || undefined,
    teams: ctx.teams || [],
    title: ctx.title?.trim() || undefined,
    client: ctx.client,
    div: ctx.division_name,
    divisions: ctx.divisions || [],
  });

  return {
    clients: [],
    members: [],
    groups: [],
    products: [],
    tickets: [],
    unread: [],
    ticketsTruncated: false,
    mastersTruncated: false,
    stats: null,
    session: null,
    divIndex: [],
    booted: false,

    // ---- auth ----
    signIn: async (email, pwd) => {
      // Only this call can fail because the credentials were wrong. Everything after it
      // runs with the password already accepted, so its failures are wrapped below —
      // otherwise a permission gap or a backend hiccup reads as "wrong password" and sends
      // someone off to fix the one thing that is definitely correct.
      await api.login(email, pwd);
      try {
        return await bootSession();
      } catch (err) {
        throw api.asPostAuthError(err);
      }
    },
    setPassword: async (key, newPassword) => {
      // If this browser already holds a session (e.g. an admin testing the invite link),
      // Frappe requires that session's CSRF token on the update_password POST — fetch it.
      // A real invitee is a guest: me() 403s (harmless, no redirect on this page) and no
      // token is needed, since Frappe skips CSRF for sessions without a stored token.
      try {
        const pre = await api.me();
        if (pre?.csrf_token) api.setCsrfToken(pre.csrf_token);
      } catch {
        /* guest / no session — proceed without a token */
      }
      // Activate an invited account: set the password (server logs them in, the cookie
      // comes back through the proxy) then boot the session so the caller can route by
      // role — same tail as signIn, minus the login() call.
      await api.setPassword(key, newPassword);
      const ctx = await api.me();
      if (!ctx || ctx.user === "Guest" || !ctx.role) {
        throw new api.UserError(
          "This account isn't set up for the support app — contact your administrator.",
        );
      }
      api.setCsrfToken(ctx.csrf_token);
      const session = sessionFromCtx(ctx);
      const masters = await fetchMasters(session.role);
      const { tickets, truncated } = await fetchTickets(masters.divIndex, scopeFor(session));
      markTabSession(true);
      set({ session, ...masters, tickets, ticketsTruncated: truncated, booted: true });
      void refreshUnread();
      return session;
    },
    restore: async () => {
      // Only resume a prior sign-in within the same tab. On a fresh open (new tab
      // or after closing it) there's no tab marker, so require an explicit login
      // and let AppShell redirect to /login.
      if (!hasTabSession()) {
        set({ session: null, booted: true });
        return;
      }
      try {
        const ctx = await api.me();
        if (!ctx || ctx.user === "Guest" || !ctx.role) {
          set({ session: null, booted: true });
          return;
        }
        api.setCsrfToken(ctx.csrf_token);
        const session = sessionFromCtx(ctx);
        const masters = await fetchMasters(session.role);
        const { tickets, truncated } = await fetchTickets(masters.divIndex, scopeFor(session));
        set({ session, ...masters, tickets, ticketsTruncated: truncated, booted: true });
        void refreshUnread();
      } catch {
        set({ session: null, booted: true });
      }
    },
    signOut: async () => {
      // Invalidate the server session first, then clear local state, so the UI
      // never shows "logged out" while the Frappe session is still live.
      try {
        await api.logout();
      } catch {
        /* already logged out / network — clear locally regardless */
      }
      api.setCsrfToken("");
      markTabSession(false);
      // List preferences are per-browser, not per-account, so on a shared machine the next
      // person to sign in would inherit whatever sort the last one left behind.
      clearStoredSorts();
      set({
        session: null,
        clients: [],
        members: [],
        groups: [],
        products: [],
        tickets: [],
        ticketsTruncated: false,
        mastersTruncated: false,
        stats: null,
        divIndex: [],
        booted: true,
      });
    },
    reload: async () => {
      const session = get().session;
      if (!session) return;
      const masters = await fetchMasters(session.role);
      const { tickets: fresh, truncated } = await fetchTickets(masters.divIndex, scopeFor(session));
      // Keep hydrated child tables so an open ticket detail doesn't blank out when a
      // member/group change triggers this reload.
      set({ ...masters, tickets: keepHydratedDetail(fresh, get().tickets), ticketsTruncated: truncated });
    },
    reloadMasters: async () => {
      const role = get().session?.role;
      if (!role) return;
      set(await fetchMasters(role));
    },
    reloadTeam: async () => {
      // Staff only: fetchMasters never loads the team for a portal session, so a client
      // calling this would ask for doctypes it cannot read.
      if (get().session?.role !== "admin") return;
      set(await fetchTeam());
    },
    refreshTickets: async () => {
      const { session, divIndex } = get();
      // Never refresh mid-mutation, and if a save completes while this fetch is in flight,
      // discard the (now possibly stale) result rather than clobber the user's change.
      if (!session || api.isMutating()) return;
      const ver = api.mutationVersion();
      const { tickets: fresh, truncated } = await fetchTickets(divIndex, scopeFor(session));
      if (api.isMutating() || api.mutationVersion() !== ver) return;
      // Same merge as reload(), but tickets-only: this is the 30s background poll, so
      // it is the one most likely to be running with a ticket detail open on screen.
      set({ tickets: keepHydratedDetail(fresh, get().tickets), ticketsTruncated: truncated });
      void refreshUnread();
    },
    refreshStats: async (weeks) => {
      if (!get().session) return;
      try {
        set({ stats: await api.ticketStats(weeks) });
      } catch {
        // Figures are a read-only view; a failed refresh leaves the previous ones on
        // screen rather than blanking the dashboard, and the next poll retries.
      }
    },
    markRead: async (id) => {
      if (get().session?.role !== "admin") return;
      // Drop it locally first so the dot clears the instant the ticket opens, rather
      // than a round-trip later; the server call is the durable record.
      set((s) => ({ unread: s.unread.filter((t) => t !== id) }));
      try {
        await api.markTicketRead(id);
      } catch {
        /* a failed mark-read is cosmetic — the next poll re-derives the truth */
      }
    },
    // Fetch a single ticket's FULL document (incl. conversation/notes child
    // tables) for the detail page — the list fetch omits those for scale.
    // `guarded` (used by the auto-refresh poller) applies the mutation guard so a
    // background re-pull can't overwrite a reply/note/edit the user just saved.
    loadTicket: async (id, guarded = false) => {
      if (guarded && api.isMutating()) return;
      const ver = api.mutationVersion();
      const doc = await api.getDoc<api.RawTicket>("Support Ticket", id);
      if (guarded && (api.isMutating() || api.mutationVersion() !== ver)) return;
      upsertTicket(doc);
    },

    // ---- ticket mutations (targeted local patch) ----
    setStatus: async (id, status) => {
      const cur = get().tickets.find((t) => t.id === id);
      const doc = await api.updateDoc<api.RawTicket>("Support Ticket", id, {
        status,
        sla_risk: status === "Pending Client" || status === "New" ? (cur?.slaRisk ? 1 : 0) : 0,
      });
      upsertTicket(doc);
    },
    setPriority: async (id, priority) => {
      upsertTicket(await api.updateDoc<api.RawTicket>("Support Ticket", id, { priority }));
    },
    setTicketProduct: async (id, product) => {
      upsertTicket(await api.updateDoc<api.RawTicket>("Support Ticket", id, { product: product || null }));
    },
    // Team + member in one write — a member only exists within a team, so the two
    // fields must move together (the backend rejects a member with no team).
    setAssignment: async (id, group, assignee) => {
      upsertTicket(
        await api.updateDoc<api.RawTicket>("Support Ticket", id, {
          assignment_group: group || null,
          assignee: assignee === "Unassigned" ? null : assignee,
        }),
      );
    },
    // Claim / collaborators go through whitelisted methods (append/scope server-side),
    // then re-fetch the full doc so the local store reflects assignee/status/collaborator
    // changes and the audit note — same tail as reopen.
    claimTicket: async (id) => {
      await api.claimTicket(id);
      upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", id));
    },
    addCollaborator: async (id, partyType, party) => {
      await api.addCollaborator(id, partyType, party);
      upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", id));
    },
    removeCollaborator: async (id, partyType, party) => {
      await api.removeCollaborator(id, partyType, party);
      upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", id));
    },
    reopen: async (id) => {
      await api.reopenTicket(id);
      upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", id));
    },
    // Replies and notes go through server methods that append one child row
    // atomically (no lost-update race) and enforce scope/role server-side.
    addMessage: async (id, msg, files, sendEmail) => {
      const attachments = files?.length
        ? await Promise.all(files.map((f) => api.uploadAttachment(id, f)))
        : msg.attachments;
      const result = await api.addTicketMessage(id, msg.body, attachments, sendEmail);
      upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", id));
      return result;
    },
    addNote: async (id, note, files) => {
      const attachments = files?.length
        ? await Promise.all(files.map((f) => api.uploadAttachment(id, f)))
        : note.attachments;
      await api.addTicketNote(id, note.body, attachments);
      upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", id));
    },
    raiseTicket: async (input) => {
      const doc = await api.createDoc<api.RawTicket>("Support Ticket", {
        title: input.title,
        ticket_type: input.type,
        priority: input.priority,
        status: "New",
        client: input.client,
        division: divDocname(input.client, input.div) || null,
        product: input.product || null,
        raised_by: input.raisedBy,
        description: input.desc || "—",
        // "Portal" means the client raised it themselves. An agent logging a ticket on a
        // customer's behalf is "Manual" — the provenance strip and the source column both
        // read this, and calling every agent-logged ticket "Portal" misattributes it.
        source: get().session?.role === "admin" ? "Manual" : "Portal",
      });
      // Attachments upload after the ticket exists (they attach to it, privately) and are
      // recorded on its description-level list; re-fetch so the header shows them.
      if (input.files.length) {
        for (const f of input.files) await api.uploadAttachment(doc.name, f, true);
        upsertTicket(await api.getDoc<api.RawTicket>("Support Ticket", doc.name));
      } else {
        upsertTicket(doc);
      }
      return doc.name;
    },
    // ---- team ----
    addMember: async (name, email, title, invite, group) => {
      if (get().members.some((m) => m.name.toLowerCase() === name.toLowerCase()))
        throw new api.UserError("A member with that name already exists.");
      await api.createDoc("Team Member", {
        member_name: name,
        email: email || null,
        title: title || null,
        status: invite ? "Invited" : "Not Invited",
      });
      // Optionally add the new member to a group in the same flow. Team Member is
      // named by member_name (see removeMember/addGroupMember), so we link by name.
      if (group) {
        const gdoc = await api.getDoc<{ members?: { member: string }[] }>("Assignment Group", group);
        if (!(gdoc.members || []).some((m) => m.member === name)) {
          await api.updateDoc("Assignment Group", group, {
            members: [...(gdoc.members || []), { member: name }],
          });
        }
      }
      // With invite on, provision a real staff login + email a set-password link. The
      // member stays Invited until their first sign-in, when the backend flips them to
      // Active. Without invite they're a directory-only assignee (no login).
      if (invite && email) await api.inviteMember(name);
      await get().reloadTeam();
    },
    updateMember: async (name, patch) => {
      // Title/email are plain field updates; a name change goes through the backend
      // rename (cascades assignee/member Link refs on tickets + teams).
      await api.call("inventive_helpdesk_backend.api.update_member", {
        name,
        member_name: patch.name,
        title: patch.title,
        email: patch.email,
      });
      await get().reload();
    },
    removeMember: async (name) => {
      // Clear links first so Frappe allows the delete.
      for (const g of get().groups.filter((g) => g.members.includes(name))) {
        const gdoc = await api.getDoc<{ members?: { member: string }[] }>("Assignment Group", g.name);
        await api.updateDoc("Assignment Group", g.name, {
          members: (gdoc.members || []).filter((m) => m.member !== name),
        });
      }
      await Promise.all(
        get()
          .tickets.filter((t) => t.assignee === name)
          .map((t) => api.updateDoc("Support Ticket", t.id, { assignee: null })),
      );
      await api.deleteDoc("Team Member", name);
      await get().reload(); // also refreshes tickets whose assignee was cleared
    },
    sendInvite: async (name) => {
      // Real invite/resend: provisions (or re-notifies) the member's staff login and
      // resets them to Invited. They flip back to Active on their next sign-in.
      await api.inviteMember(name);
      await get().reloadTeam();
    },

    // ---- groups ----
    addGroup: async (name) => {
      if (get().groups.some((g) => g.name.toLowerCase() === name.toLowerCase()))
        throw new api.UserError("A team with that name already exists.");
      await api.createDoc("Assignment Group", { group_name: name });
      await get().reloadTeam();
    },
    removeGroup: async (name) => {
      await Promise.all(
        get()
          .tickets.filter((t) => t.group === name)
          .map((t) => api.updateDoc("Support Ticket", t.id, { assignment_group: null })),
      );
      await api.deleteDoc("Assignment Group", name);
      await get().reload(); // also refreshes tickets whose group was cleared
    },
    addGroupMember: async (group, member) => {
      const gdoc = await api.getDoc<{ members?: { member: string }[] }>("Assignment Group", group);
      if ((gdoc.members || []).some((m) => m.member === member))
        throw new api.UserError(`${member} is already in ${group}.`);
      await api.updateDoc("Assignment Group", group, { members: [...(gdoc.members || []), { member }] });
      await get().reloadTeam();
    },
    removeGroupMember: async (group, member) => {
      const gdoc = await api.getDoc<{ members?: { member: string }[] }>("Assignment Group", group);
      await api.updateDoc("Assignment Group", group, {
        members: (gdoc.members || []).filter((m) => m.member !== member),
      });
      await get().reloadTeam();
    },

    // ---- clients / divisions / pocs ----
    // Onboarding creates the company and its Leads, nothing else. Divisions and products
    // are added afterwards from the client card — many clients have no divisions for a
    // while, and demanding one up front is what made the old dialog wrong.
    addClient: async (input) => {
      const code = makeCode(input.name, new Set(get().clients.map((c) => c.code)));
      await api.createDoc("Client", {
        client_name: input.name,
        client_code: code,
        status: input.status,
        since: input.since || null,
      });
      // Sequential, not Promise.all: a duplicate email among the leads must fail on that
      // lead alone, with the message naming it, rather than racing several inserts and
      // reporting whichever lost.
      for (const lead of input.leads || []) {
        if (!lead.email) continue;
        const id = await api.createContact({
          client: input.name,
          poc_name: lead.name,
          email: lead.email,
          phone: lead.phone,
          is_lead: 1,
          divisions: [], // no divisions exist yet — assigned later, from the division dialog
        });
        if (lead.invite) await api.invitePoc(id);
      }
      await get().reloadMasters();
    },
    addPoc: async (clientName, divName, poc) => {
      const div = divName ? divDocname(clientName, divName) : undefined;
      const id = await api.createContact({
        client: clientName,
        poc_name: poc.name,
        email: poc.email,
        phone: poc.phone,
        // No division means nobody scoped this person to one, and that IS a Lead: a
        // client-level contact who can be given division sight later. Recording them as a
        // division POC with an empty division list would instead produce someone who can
        // see nothing and appears on no division card — present in the data, invisible in
        // the UI. Every existing caller passes a real division, so they are unaffected.
        is_lead: div ? 0 : 1,
        divisions: div ? [div] : [],
      });
      if (poc.invite) await api.invitePoc(id);
      await get().reloadMasters();
    },
    addDivision: async (clientName, input) => {
      const existing = new Set(
        get()
          .clients.find((c) => c.name === clientName)
          ?.divisions.map((d) => d.code) || [],
      );
      const dcode = makeCode(input.name, existing);
      const divDoc = await api.createDoc<{ name: string }>("Division", {
        client: clientName,
        division_name: input.name,
        division_code: dcode,
      });
      if (input.poc && input.poc.email) {
        const id = await api.createContact({
          client: clientName,
          poc_name: input.poc.name,
          email: input.poc.email,
          phone: input.poc.phone,
          is_lead: 0,
          divisions: [divDoc.name],
        });
        if (input.poc.invite) await api.invitePoc(id);
      }
      // Grant the chosen Leads sight of this division. Additive: their existing divisions
      // are preserved, since assigning a lead here must not silently drop the others.
      for (const leadId of input.leads || []) {
        const lead = get()
          .clients.find((c) => c.name === clientName)
          ?.leads.find((l) => l.id === leadId);
        const next = [...new Set([...(lead?.divisions ?? []), divDoc.name])];
        await api.setContactDivisions(leadId, next);
      }
      await get().reloadMasters();
    },
    setLeadDivisions: async (leadId, divisions) => {
      await api.setContactDivisions(leadId, divisions);
      await get().reloadMasters();
    },
    addClientProduct: async (clientName, input) => {
      const product = await resolveProduct(input.product);
      await api.createClientProduct({
        client: clientName,
        product,
        dev_start: input.devStart || null,
        expected_completion: input.expectedCompletion || null,
        // Empty means attached to the client as a whole — the only option when the client
        // has no divisions, and a deliberate choice when it does.
        divisions: input.divisions,
      });
      await get().reloadMasters();
    },
    updateClientProduct: async (id, input) => {
      const product = input.product ? await resolveProduct(input.product) : undefined;
      await api.updateClientProduct({
        name: id,
        product,
        dev_start: input.devStart ?? null,
        expected_completion: input.expectedCompletion ?? null,
        divisions: input.divisions,
      });
      await get().reloadMasters();
    },
    removeClientProduct: async (id) => {
      await api.deleteClientProduct(id);
      await get().reloadMasters();
    },
    // Rename a division (its display name). The docname/code stay put, so existing
    // ticket IDs and Division links are untouched — only the label changes. reload()
    // (not reloadMasters) so tickets re-resolve their division name too.
    updateDivision: async (clientName, divName, patch) => {
      const dName = divDocname(clientName, divName);
      if (!dName) throw new api.UserError("Division not found.");
      await api.updateDoc("Division", dName, { division_name: patch.name.trim() });
      await get().reload();
    },
    // Add to the catalogue only. `setProduct` / `addProduct(name, client)` /
    // `assignProductToClient` used to live here and wrote `Client.product`, the legacy
    // one-product-per-client Link — which is why a product assigned from the Products page
    // never showed on the client card, and vice versa. Attaching a product to a client is
    // `addClientProduct` (an engagement, with dates and the divisions it covers).
    createProduct: async (name) => {
      await resolveProduct(name);
      await get().reloadMasters();
    },
    // Rename a product — cascades to every client running it (see update_product).
    renameProduct: async (oldName, newName) => {
      await api.updateProduct(oldName, { product_name: newName });
      await get().reloadMasters();
    },
    // Delete a product. Callers guard against products still assigned to a client
    // (Frappe blocks deleting a linked doc), so this only runs on unassigned ones.
    deleteProduct: async (name) => {
      await api.deleteProduct(name);
      await get().reloadMasters();
    },
    // Goes through update_poc (not a raw field write): POC is autonamed by email,
    // so an email change must rename the doc + its linked portal user to stay in sync.
    updatePoc: async (pocId, patch) => {
      await api.updatePoc(pocId, {
        poc_name: patch.name,
        email: patch.email,
        phone: patch.phone,
        divisions: patch.divisions,
      });
      await get().reloadMasters();
    },
    invitePoc: async (pocId) => {
      const res = await api.invitePoc(pocId);
      await get().reloadMasters();
      return res;
    },
    removePoc: async (pocId) => {
      await api.deletePoc(pocId); // also disables the linked portal login
      await get().reloadMasters();
    },
    // Full client edit incl. a rename — routed through update_client so the new
    // client_name cascades to every Support Ticket / Division / POC that links it.
    updateClient: async (clientName, patch) => {
      const newName = await api.updateClient(clientName, {
        client_name: patch.name,
        client_code: patch.code,
        since: patch.since || "",
        status: patch.status,
      });
      await get().reloadMasters();
      return newName;
    },
    // Delete a division: clear its POCs first (link constraint), then the division.
    // Callers guard against divisions that still have tickets.
    removeDivision: async (clientName, divName) => {
      const dName = divDocname(clientName, divName);
      if (!dName) return;
      const div = get()
        .clients.find((c) => c.name === clientName)
        ?.divisions.find((d) => d.name === divName);
      for (const p of div?.pocs ?? []) if (p.id) await api.deletePoc(p.id);
      await api.deleteDoc("Division", dName);
      await get().reloadMasters();
    },
    // Delete a client: cascade its POCs + divisions, then the client itself.
    // Callers guard against clients that still have tickets.
    removeClient: async (clientName) => {
      const client = get().clients.find((c) => c.name === clientName);
      for (const d of client?.divisions ?? []) {
        for (const p of d.pocs) if (p.id) await api.deletePoc(p.id);
        const dName = divDocname(clientName, d.name);
        if (dName) await api.deleteDoc("Division", dName);
      }
      await api.deleteDoc("Client", clientName);
      await get().reloadMasters();
    },
  };
});
