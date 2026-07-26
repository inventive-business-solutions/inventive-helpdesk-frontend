import { describe, it, expect } from "vitest";
import {
  clientContacts,
  clientsRunning,
  divDisplayName,
  availableProducts,
  productsForDivisions,
  productsOf,
  relativeAge,
  countClients,
  isUnmatched,
  plural,
  NO_VALUE,
  makeCode,
  fmtDate,
  fmtDateTime,
  fmtShortDate,
  fmtTime,
  statusClass,
  typeClass,
  initials,
  isActive,
  isResolved,
  isEmail,
} from "../lib/helpers";

describe("makeCode", () => {
  it("takes the first 3 alphanumerics, uppercased", () => {
    expect(makeCode("Forbes Marshall")).toBe("FOR");
  });
  it("pads short names to 3 chars", () => {
    expect(makeCode("Ab")).toBe("ABX");
  });
  it("avoids collisions against the used set", () => {
    expect(makeCode("Thermax", new Set(["THE"]))).toBe("TH1");
  });
});

describe("fmtDate", () => {
  it("formats an ISO date as '10 July 2026'", () => {
    expect(fmtDate("2026-07-10")).toBe("10 July 2026");
  });
  it("drops the leading zero on single-digit days", () => {
    expect(fmtDate("2026-01-05")).toBe("5 January 2026");
  });
  it("returns an em-dash for empty input", () => {
    expect(fmtDate(undefined)).toBe("—");
  });
});

describe("fmtDateTime", () => {
  it("uses 12-hour time with AM", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 9, 14))).toBe("10 July 2026, 9:14 AM");
  });
  it("uses 12-hour time with PM", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 16, 20))).toBe("10 July 2026, 4:20 PM");
  });
  it("renders midnight as 12:xx AM and pads minutes", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 0, 5))).toBe("10 July 2026, 12:05 AM");
  });
  it("renders noon as 12:00 PM", () => {
    expect(fmtDateTime(new Date(2026, 6, 10, 12, 0))).toBe("10 July 2026, 12:00 PM");
  });
});

describe("fmtShortDate", () => {
  it("formats a datetime as constant-width DD/MM/YYYY", () => {
    expect(fmtShortDate("2026-07-10 09:14:00")).toBe("10/07/2026");
  });
  it("zero-pads single-digit day and month", () => {
    expect(fmtShortDate("2026-01-05 09:14:00")).toBe("05/01/2026");
  });
  it("returns an em-dash for empty / unparseable input", () => {
    expect(fmtShortDate(undefined)).toBe("—");
    expect(fmtShortDate("not-a-date")).toBe("—");
  });
});

describe("fmtTime", () => {
  it("uses 12-hour time (AM/PM) and pads minutes", () => {
    expect(fmtTime("2026-07-10 09:14:00")).toBe("9:14 AM");
    expect(fmtTime("2026-07-10 16:20:00")).toBe("4:20 PM");
    expect(fmtTime("2026-07-10 00:05:00")).toBe("12:05 AM");
    expect(fmtTime("2026-07-10 12:00:00")).toBe("12:00 PM");
  });
  it("returns empty string for empty / unparseable input", () => {
    expect(fmtTime(undefined)).toBe("");
    expect(fmtTime("nope")).toBe("");
  });
});

describe("class + label helpers", () => {
  it("maps status to css class", () => {
    expect(statusClass("In Progress")).toBe("s-prog");
    expect(statusClass("Pending Client")).toBe("s-pending");
  });
  it("maps ticket type to css class (New Feature → Feature)", () => {
    expect(typeClass("New Feature")).toBe("type-Feature");
    expect(typeClass("Bug")).toBe("type-Bug");
  });
  it("derives initials", () => {
    expect(initials("Abhishek Bankar")).toBe("AB");
    expect(initials("R. Mehta")).toBe("RM");
  });
  it("classifies active vs resolved states", () => {
    expect(isActive("New")).toBe(true);
    expect(isActive("Closed")).toBe(false);
    expect(isResolved("Resolved")).toBe(true);
    expect(isResolved("In Progress")).toBe(false);
  });
});

describe("isEmail", () => {
  it("accepts a normal address", () => {
    expect(isEmail("r.mehta@thermax.com")).toBe(true);
    expect(isEmail("  name@company.co.in  ")).toBe(true);
  });
  it("rejects malformed input", () => {
    expect(isEmail("")).toBe(false);
    expect(isEmail("notanemail")).toBe(false);
    expect(isEmail("missing@domain")).toBe(false);
    expect(isEmail("@nolocal.com")).toBe(false);
    expect(isEmail("has space@x.com")).toBe(false);
    expect(isEmail("two@@at.com")).toBe(false);
  });
});

describe("countClients", () => {
  // The bug this replaced: `new Set(tickets.map(t => t.client)).size` counted the
  // em-dash placeholder toTicket substitutes for an unattributed inbound email, so a
  // single message from an unknown sender rendered "Across 1 clients".
  it("does not count unattributed tickets as a client", () => {
    expect(countClients([{ client: NO_VALUE }])).toBe(0);
    expect(countClients([{ client: "" }, { client: undefined }])).toBe(0);
  });
  it("counts distinct real clients", () => {
    expect(countClients([{ client: "Thermax" }, { client: "Thermax" }, { client: "Saipem" }])).toBe(2);
  });
  it("ignores the placeholder while still counting the real ones", () => {
    expect(countClients([{ client: "Thermax" }, { client: NO_VALUE }, { client: "Saipem" }])).toBe(2);
  });
  it("is zero for no tickets", () => {
    expect(countClients([])).toBe(0);
  });
});

describe("isUnmatched / plural", () => {
  it("treats empty and the placeholder alike", () => {
    expect(isUnmatched(NO_VALUE)).toBe(true);
    expect(isUnmatched("")).toBe(true);
    expect(isUnmatched(undefined)).toBe(true);
    expect(isUnmatched("Thermax")).toBe(false);
  });
  it("pluralises only when it should", () => {
    expect(plural(0, "client")).toBe("0 clients");
    expect(plural(1, "client")).toBe("1 client");
    expect(plural(2, "client")).toBe("2 clients");
  });
});

describe("clientContacts", () => {
  // The bug this replaced: `divisions.reduce((n, d) => n + d.pocs.length, 0)` on the
  // client card and in the sidebar. The tree lists a contact under every division they
  // hold AND lists Leads at client level, so a Lead on three divisions counted as three
  // people while an unassigned one counted as none.
  const lead = { id: "ravi@x.com", email: "ravi@x.com" };
  const anita = { id: "anita@x.com", email: "anita@x.com" };

  it("counts a multi-division lead once, not once per division", () => {
    const client = {
      leads: [lead],
      divisions: [{ pocs: [lead] }, { pocs: [lead] }, { pocs: [lead, anita] }],
    };
    expect(clientContacts(client)).toHaveLength(2);
  });
  it("includes a lead who holds no divisions at all", () => {
    expect(clientContacts({ leads: [lead], divisions: [] })).toHaveLength(1);
    expect(clientContacts({ leads: [lead], divisions: [{ pocs: [] }] })).toHaveLength(1);
  });
  it("matches case-insensitively on email", () => {
    const client = { leads: [{ email: "Ravi@X.com" }], divisions: [{ pocs: [{ email: "ravi@x.com" }] }] };
    expect(clientContacts(client)).toHaveLength(1);
  });
  it("handles a client with nothing", () => {
    expect(clientContacts({})).toHaveLength(0);
    expect(clientContacts({ leads: [], divisions: [] })).toHaveLength(0);
  });
});

describe("availableProducts / productsForDivisions", () => {
  const thermax = {
    name: "Thermax",
    divisions: [
      { name: "Boiler", docname: "Thermax-BOI" },
      { name: "Chemical", docname: "Thermax-CHM" },
    ],
    products: [
      { product: "SmartFlow", divisions: ["Thermax-BOI"] },
      { product: "Analytics Hub", divisions: [] }, // client-wide
    ],
  };
  const clients = [thermax];

  it("offers the products live at a client + division", () => {
    // Boiler offers both: SmartFlow is scoped there, Analytics Hub is client-wide. These
    // are exactly the values the backend's validate will accept for such a ticket.
    expect(availableProducts(clients, { client: "Thermax", div: "Boiler" }).sort()).toEqual([
      "Analytics Hub",
      "SmartFlow",
    ]);
    // Chemical sees only the client-wide one.
    expect(availableProducts(clients, { client: "Thermax", div: "Chemical" })).toEqual(["Analytics Hub"]);
  });

  it("offers nothing for an unmatched ticket", () => {
    expect(availableProducts(clients, { client: "—", div: "—" })).toEqual([]);
    expect(availableProducts([], { client: "Thermax", div: "Boiler" })).toEqual([]);
  });

  it("productsForDivisions matches on DOCNAMES, not display names", () => {
    // session.divisions and ClientProduct.divisions are both docnames.
    expect(productsForDivisions(thermax, ["Thermax-BOI"]).sort()).toEqual(["Analytics Hub", "SmartFlow"]);
    expect(productsForDivisions(thermax, ["Thermax-CHM"])).toEqual(["Analytics Hub"]);
    // Passing a display name by mistake finds only the client-wide one — proving the
    // two namespaces are not interchangeable.
    expect(productsForDivisions(thermax, ["Boiler"])).toEqual(["Analytics Hub"]);
  });

  it("a contact with no divisions still sees client-wide products", () => {
    expect(productsForDivisions(thermax, [])).toEqual(["Analytics Hub"]);
  });
});

describe("relativeAge", () => {
  // `now` is injectable precisely so this is testable — and so callers can map a whole
  // page of tickets against one timestamp rather than a drifting Date.now().
  const now = new Date("2026-07-24T12:00:00").getTime();
  const at = (s: string) => relativeAge(s, now);

  it("counts up through the units", () => {
    expect(at("2026-07-24 11:59:40")).toBe("just now");
    expect(at("2026-07-24 11:48:00")).toBe("12m");
    expect(at("2026-07-24 10:00:00")).toBe("2h");
    expect(at("2026-07-21 12:00:00")).toBe("3d");
    expect(at("2026-06-19 12:00:00")).toBe("5w");
  });
  it("switches unit at each boundary rather than overflowing", () => {
    expect(at("2026-07-24 11:00:00")).toBe("1h"); // 60m -> hours
    expect(at("2026-07-23 12:00:00")).toBe("1d"); // 24h -> days
    expect(at("2026-07-17 12:00:00")).toBe("1w"); // 7d  -> weeks
  });
  it("handles a missing or unparseable timestamp", () => {
    expect(at("")).toBe("—");
    expect(relativeAge(undefined, now)).toBe("—");
    expect(at("not a date")).toBe("—");
  });
});
