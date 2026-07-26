import { describe, it, expect } from "vitest";
import {
  toTicket,
  assembleClients,
  pocPortalStatus,
  toMember,
  assembleGroups,
  type RawTicket,
  type RawClient,
  type RawDivision,
  type RawPoc,
  type RawUser,
} from "../lib/frappe";
import { keepHydratedDetail, mergeTicketDraft, type TicketDraft } from "../store";
import type { Ticket } from "../types";

// The store is now backed by the Frappe REST API (integration-tested against a
// live backend). What's pure and worth unit-testing is the mapping layer that
// translates Frappe docs <-> the frontend's types.

const divName = (docname?: string) =>
  ({ "Thermax-HTG": "Heating", "Thermax-ENV": "Enviro" })[docname ?? ""] ?? docname ?? "—";

describe("toTicket", () => {
  it("maps a Frappe Support Ticket to the frontend shape, resolving the division name", () => {
    const raw: RawTicket = {
      name: "THX-HTG-0042",
      title: "Valve symbols mis-detected",
      ticket_type: "Bug",
      priority: "Critical",
      status: "In Progress",
      client: "Thermax",
      division: "Thermax-HTG",
      raised_by: "R. Mehta",
      assignee: "Abhishek Bankar",
      sla_risk: 1,
      description: "…",
      source: "Email",
      from_email: "r.mehta@thermax.com",
      attachments: '[{"name":"spec.pdf","url":"/private/files/spec.pdf"}]',
      conversation: [
        {
          kind: "client",
          author: "R. Mehta",
          role: "Client",
          message_on: "10 July 2026",
          body: "blocked",
          attachments: '["a.png"]',
        },
      ],
      notes: [{ author: "Kiran Jaware", note_on: "11 July 2026", body: "root cause" }],
    };
    const t = toTicket(raw, divName);
    expect(t.id).toBe("THX-HTG-0042");
    expect(t.type).toBe("Bug");
    expect(t.div).toBe("Heating");
    expect(t.slaRisk).toBe(true);
    // Ticket-level attachments parse to the {name,url} shape…
    expect(t.attachments).toEqual([{ name: "spec.pdf", url: "/private/files/spec.pdf" }]);
    expect(t.conversation).toHaveLength(1);
    // …and legacy bare-filename rows coerce to {name, url:""} (back-compat).
    expect(t.conversation[0].attachments).toEqual([{ name: "a.png", url: "" }]);
    expect(t.notes[0].author).toBe("Kiran Jaware");
  });

  it("falls back gracefully for inbound tickets with no client/division", () => {
    const raw: RawTicket = {
      name: "INB-0007",
      title: "Enquiry",
      ticket_type: "Query",
      priority: "Medium",
      status: "New",
      source: "Email",
    };
    const t = toTicket(raw, divName);
    expect(t.client).toBe("—");
    expect(t.div).toBe("—");
    expect(t.assignee).toBe("Unassigned");
    // A client POC's read comes back with the permlevel-1 activity log stripped —
    // absent, not empty — so the mapping has to tolerate the key being missing.
    expect(t.activity).toEqual([]);
  });

  it("maps the activity log, dropping blank endpoints rather than rendering them", () => {
    const raw: RawTicket = {
      name: "THX-HTG-0043",
      title: "t",
      ticket_type: "Bug",
      priority: "Low",
      status: "New",
      activity: [
        { action: "Created", new_value: "New", author: "Arjun Deshpande", acted_on: "10 July 2026" },
        {
          action: "Status",
          old_value: "New",
          new_value: "In Progress",
          author: "Neha Kulkarni",
          acted_on: "11 July 2026",
        },
        // Removing a collaborator records only the old value.
        {
          action: "Collaborator",
          old_value: "Neha Kulkarni",
          author: "Arjun Deshpande",
          acted_on: "12 July 2026",
        },
      ],
    };
    const t = toTicket(raw, divName);
    expect(t.activity).toHaveLength(3);
    // `from` is undefined (not "") on the opening row, so the UI can branch on it.
    expect(t.activity[0]).toMatchObject({ action: "Created", from: undefined, to: "New" });
    expect(t.activity[1]).toMatchObject({ from: "New", to: "In Progress", author: "Neha Kulkarni" });
    expect(t.activity[2]).toMatchObject({ action: "Collaborator", from: "Neha Kulkarni", to: undefined });
  });
});

describe("fmtDay (via toTicket) — date-only values never go through `new Date()`", () => {
  // A Date-fieldtype value ("2026-07-10", no time) must render on its stated
  // calendar day regardless of the viewer's timezone. `new Date("2026-07-10")`
  // parses per the ISO-8601 *date-only* grammar, which is always UTC — reading
  // it back with local getters (getDate/getMonth) renders a day early for any
  // viewer west of UTC. That failure mode only reproduces on a host with a
  // negative UTC offset; this dev machine (and most CI) runs UTC+, where adding
  // a positive offset to UTC midnight can never roll back a calendar day — which
  // is exactly why the original bug shipped with green tests. So instead of
  // depending on the host's real (or faked) timezone, assert the actual fix
  // directly: the date-only branch must never construct a Date from the raw
  // string at all. This is deterministic on any machine or CI timezone.
  it("never constructs a Date from a date-only value", () => {
    const RealDate = globalThis.Date;
    const seen: unknown[] = [];
    class SpyDate extends RealDate {
      constructor(...args: unknown[]) {
        // Date's constructor is overloaded (0/1/2+ args of varying types) with no
        // single signature a spread of `unknown[]` satisfies — safe here since we
        // only ever forward whatever args toTicket's internals passed in.
        // @ts-expect-error see above
        super(...args);
        if (args.length === 1) seen.push(args[0]);
      }
    }
    globalThis.Date = SpyDate as DateConstructor;
    try {
      const raw: RawTicket = {
        name: "ZZZ-ZZZ-0001",
        title: "t",
        ticket_type: "Bug",
        priority: "Low",
        status: "New",
        due_date: "2026-07-10",
      };
      const t = toTicket(raw, divName);
      expect(t.due).toBe("10 July 2026"); // correct on this (or any) host
      expect(seen).not.toContain("2026-07-10"); // and not via a UTC-midnight Date parse
    } finally {
      globalThis.Date = RealDate;
    }
  });

  it("renders `creation` as a full 12-hour datetime (date + time)", () => {
    const raw: RawTicket = {
      name: "ZZZ-ZZZ-0002",
      title: "t",
      ticket_type: "Bug",
      priority: "Low",
      status: "New",
      creation: "2026-07-10 09:14:00.000000",
    };
    // created now carries the time-of-day (12-hour) everywhere it's shown; the time
    // component also proves the full datetime was parsed via Date, not the date-only path.
    expect(toTicket(raw, divName).created).toBe("10 July 2026, 9:14 AM");
  });

  it("maps `modified` to a 12-hour updated stamp", () => {
    const raw: RawTicket = {
      name: "ZZZ-ZZZ-0003",
      title: "t",
      ticket_type: "Bug",
      priority: "Low",
      status: "New",
      modified: "2026-07-15 15:20:00.000000",
    };
    expect(toTicket(raw, divName).updated).toBe("15 July 2026, 3:20 PM");
  });
});

describe("assembleClients", () => {
  // No `product`: the legacy single-product column is neither fetched nor assembled any
  // more — a client's products are its Client Product engagements.
  const clients: RawClient[] = [{ name: "Thermax", client_code: "THX" }];
  const divisions: RawDivision[] = [
    { name: "Thermax-HTG", division_name: "Heating", division_code: "HTG", client: "Thermax" },
    { name: "Thermax-BOI", division_name: "Boiler", division_code: "BOI", client: "Thermax" },
    { name: "Thermax-CHM", division_name: "Chemical", division_code: "CHM", client: "Thermax" },
  ];
  const poc = (over: Partial<RawPoc>): RawPoc => ({
    name: "r@x.com",
    poc_name: "R. Mehta",
    email: "r@x.com",
    client: "Thermax",
    ...over,
  });

  it("nests divisions and pocs under their client", () => {
    const pocs = [poc({})];
    const [c] = assembleClients(clients, divisions, pocs, new Map(), [
      { parent: "r@x.com", division: "Thermax-HTG" },
    ]);
    expect(c.code).toBe("THX");
    expect(c.divisions).toHaveLength(3);
    expect(c.divisions[0].name).toBe("Heating");
    expect(c.divisions[0].pocs[0]).toMatchObject({ name: "R. Mehta", email: "r@x.com", isLead: false });
    expect(c.divisions[1].pocs).toHaveLength(0);
  });

  it("lists a multi-division lead under every division it holds", () => {
    // Not a duplicate: one person legitimately appears on several division cards, which is
    // what makes each card tell the truth about who can see it.
    const pocs = [poc({ name: "lead@x.com", email: "lead@x.com", poc_name: "Akash", is_lead: 1 })];
    const [c] = assembleClients(clients, divisions, pocs, new Map(), [
      { parent: "lead@x.com", division: "Thermax-HTG" },
      { parent: "lead@x.com", division: "Thermax-CHM" },
    ]);
    expect(c.divisions.map((d) => d.pocs.length)).toEqual([1, 0, 1]);
    expect(c.leads).toHaveLength(1);
    expect(c.leads[0].divisions).toEqual(["Thermax-HTG", "Thermax-CHM"]);
  });

  it("surfaces a lead holding no divisions, so it can still be found and assigned", () => {
    // The state every lead starts in, created during onboarding before any division
    // exists. Without this they would be in the database and invisible on the page.
    const pocs = [poc({ name: "new@x.com", email: "new@x.com", poc_name: "Fresh", is_lead: 1 })];
    const [c] = assembleClients(clients, divisions, pocs, new Map(), []);
    expect(c.leads).toHaveLength(1);
    expect(c.leads[0].divisions).toEqual([]);
    expect(c.divisions.every((d) => d.pocs.length === 0)).toBe(true);
  });

  it("reads a product with no divisions as attached to the client", () => {
    const [c] = assembleClients(
      clients,
      divisions,
      [],
      new Map(),
      [],
      [{ name: "cp1", client: "Thermax", product: "EniMAX", dev_start: "2026-01-05" }],
      [],
    );
    expect(c.products).toHaveLength(1);
    expect(c.products[0]).toMatchObject({ product: "EniMAX", devStart: "2026-01-05", divisions: [] });
  });

  it("defaults status to Active when the backend hasn't set one", () => {
    const [c] = assembleClients(clients, divisions, []);
    expect(c.status).toBe("Active");
  });
});

describe("pocPortalStatus", () => {
  const poc = (over: Partial<RawPoc> = {}): RawPoc => ({
    name: "p@x.com",
    poc_name: "P",
    email: "p@x.com",
    client: "C",
    division: "D",
    ...over,
  });
  const users = (u?: RawUser) => new Map(u ? [[u.name, u]] : []);

  it("is 'none' when there's no linked user, or the user is missing/disabled", () => {
    expect(pocPortalStatus(poc(), users())).toBe("none");
    expect(pocPortalStatus(poc({ user: "p@x.com" }), users())).toBe("none");
    expect(
      pocPortalStatus(
        poc({ user: "p@x.com" }),
        users({ name: "p@x.com", enabled: 0, last_login: "2026-07-16 13:00:00" }),
      ),
    ).toBe("none");
  });

  it("is 'invited' when the user exists but has never logged in", () => {
    expect(pocPortalStatus(poc({ user: "p@x.com" }), users({ name: "p@x.com", enabled: 1 }))).toBe("invited");
  });

  it("stays 'invited' when the only login predates this invite (re-used account / stale resend)", () => {
    const p = poc({ user: "p@x.com", invited_on: "2026-07-16 12:00:00.000000" });
    expect(
      pocPortalStatus(p, users({ name: "p@x.com", enabled: 1, last_login: "2026-07-16 11:59:00.000000" })),
    ).toBe("invited");
  });

  it("flips to 'active' once they log in after being invited", () => {
    const p = poc({ user: "p@x.com", invited_on: "2026-07-16 12:00:00.000000" });
    expect(
      pocPortalStatus(p, users({ name: "p@x.com", enabled: 1, last_login: "2026-07-16 12:30:00.000000" })),
    ).toBe("active");
  });

  it("falls back to 'has ever logged in' for legacy POCs with no invited_on", () => {
    expect(
      pocPortalStatus(
        poc({ user: "p@x.com" }),
        users({ name: "p@x.com", enabled: 1, last_login: "2026-07-16 12:30:00" }),
      ),
    ).toBe("active");
  });
});

describe("toMember / assembleGroups", () => {
  it("maps a Team Member", () => {
    expect(
      toMember({ member_name: "Kiran Jaware", email: "k@x.com", title: "Support", status: "Active" }),
    ).toEqual({ name: "Kiran Jaware", email: "k@x.com", title: "Support", status: "Active" });
  });
  it("maps an Assignment Group with its child members", () => {
    expect(
      assembleGroups(
        [{ name: "IT Team", group_name: "IT Team" }],
        [
          { parent: "IT Team", member: "Kiran Jaware" },
          { parent: "IT Team", member: "Abhishek Bankar" },
        ],
      ),
    ).toEqual([{ name: "IT Team", members: ["Kiran Jaware", "Abhishek Bankar"] }]);
  });
  it("keeps each group's members to itself", () => {
    // The whole point of the flat read: one query returns every group's rows at once, so
    // the grouping by parent is what stops IT Team showing Finance's members.
    expect(
      assembleGroups(
        [
          { name: "IT Team", group_name: "IT Team" },
          { name: "Finance", group_name: "Finance" },
        ],
        [
          { parent: "IT Team", member: "Kiran Jaware" },
          { parent: "Finance", member: "Priya Sharma" },
          { parent: "IT Team", member: "Abhishek Bankar" },
        ],
      ),
    ).toEqual([
      { name: "IT Team", members: ["Kiran Jaware", "Abhishek Bankar"] },
      { name: "Finance", members: ["Priya Sharma"] },
    ]);
  });
  it("gives a group with no members an empty list, not undefined", () => {
    // A newly created team has no rows in the child table at all, so it is absent from the
    // grouped map entirely — distinct from having an empty one.
    expect(assembleGroups([{ name: "Empty", group_name: "Empty" }], [])).toEqual([
      { name: "Empty", members: [] },
    ]);
  });
});

describe("keepHydratedDetail — the 30s list poll must not blank an open ticket", () => {
  // The list fetch returns no child tables, so every ticket it produces has empty
  // conversation/notes/activity. Dropping those straight into the store makes an open
  // detail view flicker once per poll. This merge is the guard, and it has to cover
  // EVERY child table — it was a hardcoded (conversation, notes) pair and adding
  // `activity` silently reintroduced the flicker for the new tab.
  const listRow = (id: string): Ticket =>
    toTicket({ name: id, title: "t", ticket_type: "Bug", priority: "Low", status: "New" }, divName);

  const hydrated = (id: string): Ticket => ({
    ...listRow(id),
    conversation: [{ kind: "client", author: "R. Mehta", role: "Client", tm: "x", body: "hi" }],
    notes: [{ author: "Arjun", tm: "x", body: "internal" }],
    activity: [{ action: "Status", from: "New", to: "In Progress", author: "Arjun", tm: "x" }],
  });

  it("carries every hydrated child table over the refreshed row", () => {
    const [merged] = keepHydratedDetail([listRow("T-1")], [hydrated("T-1")]);
    expect(merged.conversation).toHaveLength(1);
    expect(merged.notes).toHaveLength(1);
    expect(merged.activity).toHaveLength(1);
  });

  it("takes the fresh scalar values, not the stale ones", () => {
    const fresh = { ...listRow("T-1"), status: "Resolved" as const };
    const [merged] = keepHydratedDetail([fresh], [hydrated("T-1")]);
    expect(merged.status).toBe("Resolved");
    expect(merged.activity).toHaveLength(1);
  });

  it("passes through tickets with nothing hydrated, and ones it has never seen", () => {
    expect(keepHydratedDetail([listRow("T-2")], [listRow("T-2")])[0].activity).toEqual([]);
    expect(keepHydratedDetail([listRow("T-3")], [])[0].id).toBe("T-3");
  });

  it("keeps a loaded description, which the list fetch no longer returns", () => {
    // `description` was removed from TICKET_LIST_FIELDS, so every list row carries the
    // placeholder. Without this the open detail view reverts to "—" once per poll.
    const loaded: Ticket = { ...hydrated("T-1"), desc: "The boiler report exports blank." };
    const [merged] = keepHydratedDetail([listRow("T-1")], [loaded]);
    expect(merged.desc).toBe("The boiler report exports blank.");
  });

  it("keeps it for a portal read too, where every child table comes back empty", () => {
    // Notes and activity sit at permlevel 1 and are stripped for a client POC, and a
    // ticket with no reply yet has an empty conversation yet. So `hydrated` is false for
    // them — gating the description on it would restore it for staff and not the portal.
    const portalView: Ticket = { ...listRow("T-4"), desc: "P&ID import fails." };
    const [merged] = keepHydratedDetail([listRow("T-4")], [portalView]);
    expect(merged.desc).toBe("P&ID import fails.");
  });

  it("does not resurrect a description for a ticket that genuinely has none", () => {
    const [merged] = keepHydratedDetail([listRow("T-5")], [listRow("T-5")]);
    expect(merged.desc).toBe("—");
  });
});

describe("mergeTicketDraft — a background refresh must not discard staged edits", () => {
  // The detail rail stages Team/Assignee/Priority/Status/Collaborators and writes them
  // together on "Update ticket". That draft is re-synced whenever ANY server field
  // changes — the 30s list poll, the realtime ticket_update ping, or a teammate's save.
  // A blanket overwrite therefore threw away whatever you had staged but not yet saved.
  const base: TicketDraft = {
    group: "Support L1",
    assignee: "Arjun",
    priority: "Medium",
    status: "New",
    product: "SmartFlow",
    collaborators: [],
  };

  it("keeps a staged field when an unrelated field changes on the server", () => {
    // The reported bug: stage an assignee, a teammate flips priority, your edit vanishes.
    const staged = { ...base, assignee: "Neha" };
    const server = { ...base, priority: "Critical" as const };
    const merged = mergeTicketDraft(staged, base, server);
    expect(merged.assignee).toBe("Neha");
    expect(merged.priority).toBe("Critical");
  });

  it("keeps a product staged at triage while the server moves other fields", () => {
    // Tagging an emailed-in ticket is a triage edit staged like the rest, so it has to
    // survive a poll landing mid-edit exactly as assignee does.
    const staged = { ...base, product: "Analytics Hub" };
    const server = { ...base, status: "In Progress" as const };
    const merged = mergeTicketDraft(staged, base, server);
    expect(merged.product).toBe("Analytics Hub");
    expect(merged.status).toBe("In Progress");
  });

  it("takes a product set on the server when the user never touched it", () => {
    const server = { ...base, product: "Analytics Hub" };
    expect(mergeTicketDraft(base, base, server).product).toBe("Analytics Hub");
  });

  it("takes the server value for fields the user never touched", () => {
    // The other half: keeping everything would let your save revert a teammate's change
    // to a field you never looked at.
    const merged = mergeTicketDraft(base, base, { ...base, status: "In Progress" });
    expect(merged.status).toBe("In Progress");
  });

  it("keeps staged collaborators, compared by value not identity", () => {
    const staged = { ...base, collaborators: [{ partyType: "Team" as const, party: "Support L2" }] };
    const merged = mergeTicketDraft(staged, base, { ...base, priority: "Low" as const });
    expect(merged.collaborators).toHaveLength(1);
    // Reordering alone is not an edit — the same set must still track the server.
    const reordered = {
      ...base,
      collaborators: [
        { partyType: "Member" as const, party: "Neha" },
        { partyType: "Team" as const, party: "Support L2" },
      ],
    };
    const lastTwo = {
      ...base,
      collaborators: [
        { partyType: "Team" as const, party: "Support L2" },
        { partyType: "Member" as const, party: "Neha" },
      ],
    };
    expect(mergeTicketDraft(reordered, lastTwo, { ...lastTwo, collaborators: [] }).collaborators).toEqual([]);
  });

  it("lets the server win on a first sync, including after switching tickets", () => {
    // `last` is null when we have not synced this ticket id yet. Treating the previous
    // ticket's values as 'last' would read the new ticket's fields as unsaved edits.
    const merged = mergeTicketDraft({ ...base, assignee: "Stale" }, null, base);
    expect(merged).toEqual(base);
  });
});

describe("toTicket — sender classification reaches the UI", () => {
  // The badge is derived server-side and only rendered here, so the whole feature is one
  // mapping away from silently showing nothing. A dropped field would blank every badge
  // without failing anything else.
  it("carries sender_kind and no_reply_reason through", () => {
    const t = toTicket(
      {
        name: "INB-0009",
        title: "Invoice ready",
        ticket_type: "Query",
        priority: "Low",
        status: "New",
        source: "Email",
        from_email: "noreply@vendor.test",
        sender_kind: "No Reply",
        no_reply_reason: "“noreply@” is an unmonitored mailbox by convention",
      },
      divName,
    );
    expect(t.senderKind).toBe("No Reply");
    expect(t.noReplyReason).toContain("unmonitored");
    expect(t.source).toBe("Email");
  });

  it("leaves them undefined when the backend has not classified yet", () => {
    // Pre-migration rows, and any ticket the back-fill has not reached. SenderBadge
    // renders nothing rather than guessing a kind.
    const t = toTicket(
      { name: "INB-0010", title: "x", ticket_type: "Query", priority: "Low", status: "New" },
      divName,
    );
    expect(t.senderKind).toBeUndefined();
  });
});
