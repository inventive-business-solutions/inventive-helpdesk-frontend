import { create } from "zustand";
import type {
  Client,
  ClientStatus,
  Collaborator,
  Group,
  Message,
  Poc,
  Priority,
  RaiseTicketInput,
  Role,
  Session,
  Status,
  TeamMember,
  Ticket,
  WorkNote,
} from "./types";
import * as api from "./lib/frappe";
import { makeCode } from "./lib/helpers";

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

/** Load master data (clients/divisions/pocs + team/groups for admins) for the
 *  role. The backend scopes everything, so a client only receives their own. */
async function fetchMasters(role: Role) {
  const [rawClients, rawDivs] = await Promise.all([
    api.getList<api.RawClient>("Client", {
      // No `product`: the legacy single-product column is no longer read anywhere. A
      // client's products come from the Client Product engagements fetched below.
      fields: ["name", "client_code", "status", "since"],
      limit: 0,
    }),
    api.getList<api.RawDivision>("Division", {
      fields: ["name", "division_name", "division_code", "client"],
      limit: 0,
    }),
  ]);

  let rawPocs: api.RawPoc[] = [];
  let pocDivisions: api.RawChildDivision[] = [];
  let clientProducts: api.RawClientProduct[] = [];
  let productDivisions: api.RawChildDivision[] = [];
  let members: TeamMember[] = [];
  let groups: Group[] = [];
  let products: string[] = [];
  let users = new Map<string, api.RawUser>();
  if (role === "admin") {
    // POCs, products, members and groups are mutually independent — fetch them
    // concurrently so login/reload latency is the slowest call, not their sum.
    const [pocData, productNames, memberList, groupList, productData] = await Promise.all([
      // POCs plus each linked User's portal-login state. Best-effort on the User
      // list: if it isn't readable the page still loads, POCs just show no account.
      (async () => {
        const raw = await api.getList<api.RawPoc>("POC", {
          fields: ["name", "poc_name", "email", "phone", "is_lead", "client", "user", "invited_on"],
          limit: 0,
        });
        let map = new Map<string, api.RawUser>();
        const userEmails = [...new Set(raw.map((p) => p.user).filter(Boolean) as string[])];
        if (userEmails.length) {
          try {
            const rows = await api.getList<api.RawUser>("User", {
              fields: ["name", "last_login", "enabled"],
              filters: [["name", "in", userEmails]],
              limit: 0,
            });
            map = new Map(rows.map((u) => [u.name, u]));
          } catch {
            /* User list not readable — leave portal status as "none" */
          }
        }
        // One list call for every contact's divisions, not a getDoc per contact — the
        // `parent` option exists for exactly this. Best-effort like the User lookup: a
        // failure here must not blank the Clients page, it just shows contacts unassigned.
        let divRows: api.RawChildDivision[] = [];
        try {
          divRows = await api.getList<api.RawChildDivision>("POC Division", {
            fields: ["parent", "division"],
            parent: "POC",
            limit: 0,
          });
        } catch {
          /* leave contacts showing no divisions rather than failing the page */
        }
        return { raw, users: map, divRows };
      })(),
      api
        .getList<{ name: string }>("Product", { fields: ["name"], limit: 0, orderBy: "product_name asc" })
        .then((prod) => prod.map((p) => p.name)),
      api
        .getList<{ member_name: string; email?: string; title?: string; status?: TeamMember["status"] }>(
          "Team Member",
          {
            fields: ["name", "member_name", "email", "title", "status"],
            limit: 0,
            orderBy: "member_name asc",
          },
        )
        .then((rows) => rows.map(api.toMember)),
      // Two list calls, not 1 + N. This used to fetch the group names and then a full
      // getDoc per group purely to read its members child table — and reloadMasters()
      // runs after almost every mutation here, so the fan-out was paid on adding a team
      // member, renaming a client, inviting a POC, not just at login.
      (async () => {
        const [gnames, memberRows] = await Promise.all([
          api.getList<{ name: string; group_name: string }>("Assignment Group", {
            fields: ["name", "group_name"],
            limit: 0,
          }),
          // `idx asc` preserves the order the child table stores them in, which is what
          // the per-group getDoc used to return; grouping by parent keeps that order
          // within each group.
          api.getList<api.RawGroupMember>("Assignment Group Member", {
            fields: ["parent", "member"],
            parent: "Assignment Group",
            limit: 0,
            orderBy: "idx asc",
          }),
        ]);
        return api.assembleGroups(gnames, memberRows);
      })(),
      // Client products (the engagements) plus the divisions each is attached to.
      (async () => {
        const rows = await api.getList<api.RawClientProduct>("Client Product", {
          fields: ["name", "client", "product", "dev_start", "expected_completion"],
          limit: 0,
        });
        let divRows: api.RawChildDivision[] = [];
        try {
          divRows = await api.getList<api.RawChildDivision>("Client Product Division", {
            fields: ["parent", "division"],
            parent: "Client Product",
            limit: 0,
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
    members = memberList;
    groups = groupList;
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
  return { clients, members, groups, products, divIndex };
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
  "description",
  "source",
  "from_email",
  "sender_kind",
  "no_reply_reason",
  "first_response_notified_on",
  "creation",
  "modified",
];

/** Client (portal) sessions fetch only their own scope; admins pass nothing (see all). */
const scopeFor = (session: Session | null) =>
  session?.role === "client" ? { client: session.client, divisions: session.divisions ?? [] } : undefined;

/** Load the (scoped) tickets in a single list call. Kept separate so
 *  master-data edits don't refetch the whole ticket set. */
async function fetchTickets(divIndex: DivRef[], scope?: { client?: string; divisions?: string[] }) {
  const resolve = resolver(divIndex);
  // Defense-in-depth: a client session asks only for its own client's tickets, and only
  // the divisions it actually holds. The backend already scopes this server-side
  // (permission_query_conditions); these filters ensure a regression there can't spill
  // another tenant's tickets into the browser store. Admin sessions pass no scope.
  //
  // A contact with NO divisions asks for nothing rather than everything — mirroring the
  // server, where an empty scope denies. Getting that inverted here would defeat the
  // whole point of the second layer.
  const filters: unknown[] = [];
  if (scope?.client) {
    filters.push(["client", "=", scope.client]);
    filters.push(["division", "in", scope.divisions ?? []]);
  }
  const rows = await api.getList<api.RawTicket>("Support Ticket", {
    fields: TICKET_LIST_FIELDS,
    orderBy: "creation desc",
    limit: 0,
    ...(filters.length ? { filters } : {}),
  });
  return rows.map((d) => api.toTicket(d, resolve));
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
    const hydrated = old.conversation.length || old.notes.length || old.activity.length;
    return hydrated ? { ...t, conversation: old.conversation, notes: old.notes, activity: old.activity } : t;
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
  products: string[];
  tickets: Ticket[];
  /** Ticket ids with a client message or internal note THIS agent hasn't seen. Per agent,
   *  so a teammate opening a ticket doesn't clear your marker. Empty for client sessions —
   *  the endpoint is staff-only. */
  unread: string[];
  session: Session | null;
  divIndex: DivRef[];
  booted: boolean;

  signIn: (email: string, pwd: string) => Promise<Session>;
  setPassword: (key: string, newPassword: string) => Promise<Session>;
  restore: () => Promise<void>;
  signOut: () => Promise<void>;
  reload: () => Promise<void>;
  reloadMasters: () => Promise<void>;
  /** Lightweight background refresh: re-fetch just the ticket list (one call), no
   *  masters — used by the auto-refresh poller. */
  refreshTickets: () => Promise<void>;
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
    session: null,
    divIndex: [],
    booted: false,

    // ---- auth ----
    signIn: async (email, pwd) => {
      await api.login(email, pwd);
      const ctx = await api.me();
      // Authenticated, but with no app role they aren't a valid user of this tool —
      // reject rather than silently admitting them as a client (same guard restore uses).
      if (!ctx || ctx.user === "Guest" || !ctx.role) {
        throw new api.UserError(
          "This account isn't set up for the support app — contact your administrator.",
        );
      }
      api.setCsrfToken(ctx.csrf_token);
      const session = sessionFromCtx(ctx);
      const masters = await fetchMasters(session.role);
      const tickets = await fetchTickets(masters.divIndex, scopeFor(session));
      markTabSession(true); // this tab now holds a live session (survives F5, not tab close)
      set({ session, ...masters, tickets, booted: true });
      void refreshUnread();
      return session;
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
      const tickets = await fetchTickets(masters.divIndex, scopeFor(session));
      markTabSession(true);
      set({ session, ...masters, tickets, booted: true });
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
        const tickets = await fetchTickets(masters.divIndex, scopeFor(session));
        set({ session, ...masters, tickets, booted: true });
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
      set({
        session: null,
        clients: [],
        members: [],
        groups: [],
        products: [],
        tickets: [],
        divIndex: [],
        booted: true,
      });
    },
    reload: async () => {
      const session = get().session;
      if (!session) return;
      const masters = await fetchMasters(session.role);
      const fresh = await fetchTickets(masters.divIndex, scopeFor(session));
      // Keep hydrated child tables so an open ticket detail doesn't blank out when a
      // member/group change triggers this reload.
      set({ ...masters, tickets: keepHydratedDetail(fresh, get().tickets) });
    },
    reloadMasters: async () => {
      const role = get().session?.role;
      if (!role) return;
      set(await fetchMasters(role));
    },
    refreshTickets: async () => {
      const { session, divIndex } = get();
      // Never refresh mid-mutation, and if a save completes while this fetch is in flight,
      // discard the (now possibly stale) result rather than clobber the user's change.
      if (!session || api.isMutating()) return;
      const ver = api.mutationVersion();
      const fresh = await fetchTickets(divIndex, scopeFor(session));
      if (api.isMutating() || api.mutationVersion() !== ver) return;
      // Same merge as reload(), but tickets-only: this is the 30s background poll, so
      // it is the one most likely to be running with a ticket detail open on screen.
      set({ tickets: keepHydratedDetail(fresh, get().tickets) });
      void refreshUnread();
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
      await get().reloadMasters();
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
      await get().reloadMasters();
    },

    // ---- groups ----
    addGroup: async (name) => {
      if (get().groups.some((g) => g.name.toLowerCase() === name.toLowerCase()))
        throw new api.UserError("A team with that name already exists.");
      await api.createDoc("Assignment Group", { group_name: name });
      await get().reloadMasters();
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
      await get().reloadMasters();
    },
    removeGroupMember: async (group, member) => {
      const gdoc = await api.getDoc<{ members?: { member: string }[] }>("Assignment Group", group);
      await api.updateDoc("Assignment Group", group, {
        members: (gdoc.members || []).filter((m) => m.member !== member),
      });
      await get().reloadMasters();
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
      const div = divDocname(clientName, divName);
      const id = await api.createContact({
        client: clientName,
        poc_name: poc.name,
        email: poc.email,
        phone: poc.phone,
        is_lead: 0,
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
      await api.deleteDoc("Product", name);
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
