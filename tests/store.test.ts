import { describe, it, expect } from "vitest";
import {
  toTicket,
  assembleClients,
  pocPortalStatus,
  toMember,
  toGroup,
  type RawTicket,
  type RawClient,
  type RawDivision,
  type RawPoc,
  type RawUser,
} from "../lib/frappe";

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
  it("nests divisions and pocs under their client", () => {
    const clients: RawClient[] = [{ name: "Thermax", client_code: "THX", product: "EniMAX" }];
    const divisions: RawDivision[] = [
      { name: "Thermax-HTG", division_name: "Heating", division_code: "HTG", client: "Thermax" },
    ];
    const pocs: RawPoc[] = [
      {
        name: "r@x.com",
        poc_name: "R. Mehta",
        email: "r@x.com",
        is_primary: 1,
        client: "Thermax",
        division: "Thermax-HTG",
      },
    ];
    const [c] = assembleClients(clients, divisions, pocs);
    expect(c.code).toBe("THX");
    expect(c.product).toBe("EniMAX");
    expect(c.divisions).toHaveLength(1);
    expect(c.divisions[0].name).toBe("Heating");
    expect(c.divisions[0].pocs[0]).toMatchObject({ name: "R. Mehta", email: "r@x.com", primary: true });
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

describe("toMember / toGroup", () => {
  it("maps a Team Member", () => {
    expect(
      toMember({ member_name: "Kiran Jaware", email: "k@x.com", title: "Support", status: "Active" }),
    ).toEqual({ name: "Kiran Jaware", email: "k@x.com", title: "Support", status: "Active" });
  });
  it("maps an Assignment Group with its child members", () => {
    expect(
      toGroup({
        group_name: "IT Team",
        members: [{ member: "Kiran Jaware" }, { member: "Abhishek Bankar" }],
      }),
    ).toEqual({ name: "IT Team", members: ["Kiran Jaware", "Abhishek Bankar"] });
  });
});
