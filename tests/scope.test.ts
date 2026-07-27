/**
 * The browser half of tenant isolation.
 *
 * The server is the authority — permission_query_conditions and has_permission decide what
 * a session may read, and the backend suite covers that. These filters are the second
 * layer: they make a regression in the first one fail closed rather than spilling another
 * client's tickets into this browser's store.
 *
 * Untested until now, which is the wrong way round for a second layer. A backup guard that
 * is silently wrong is worse than none, because everything downstream reads as protected.
 */
import { describe, it, expect } from "vitest";
import { scopeFor, ticketScopeFilters } from "../store";
import type { Session } from "../types";

const client = (over: Partial<Session> = {}): Session => ({
  role: "client",
  manage: false,
  isOwner: false,
  name: "R. Mehta",
  user: "r.mehta@thermax.test",
  teams: [],
  client: "Thermax",
  divisions: ["Thermax-HTG"],
  ...over,
});

const staff = (over: Partial<Session> = {}): Session => ({
  role: "admin",
  manage: true,
  isOwner: false,
  name: "Arjun",
  user: "arjun@inventive.test",
  member: "Arjun Rao",
  teams: ["IT Team"],
  ...over,
});

describe("scopeFor", () => {
  it("scopes a portal session to its client and the divisions it holds", () => {
    expect(scopeFor(client())).toEqual({ client: "Thermax", divisions: ["Thermax-HTG"] });
  });

  it("carries EVERY division a contact holds, not just the first", () => {
    // A client Lead oversees several. Taking only the first would hide their other
    // divisions' tickets from them — the multi-division contact is the normal case.
    const lead = client({ divisions: ["Thermax-HTG", "Thermax-ELE", "Thermax-OAG"] });
    expect(scopeFor(lead)?.divisions).toEqual(["Thermax-HTG", "Thermax-ELE", "Thermax-OAG"]);
  });

  it("gives a contact with no divisions an empty list, never undefined", () => {
    // A Lead created during onboarding holds none yet. `undefined` here would drop the
    // division filter entirely and widen the query — see ticketScopeFilters below.
    expect(scopeFor(client({ divisions: [] }))).toEqual({ client: "Thermax", divisions: [] });
    expect(scopeFor(client({ divisions: undefined }))).toEqual({ client: "Thermax", divisions: [] });
  });

  it("returns no scope for staff, who are scoped per agent by the server", () => {
    expect(scopeFor(staff())).toBeUndefined();
    expect(scopeFor(staff({ manage: false, teams: ["IT Team"] }))).toBeUndefined();
  });

  it("returns no scope when there is no session", () => {
    expect(scopeFor(null)).toBeUndefined();
  });
});

describe("ticketScopeFilters", () => {
  it("constrains a portal query to the client AND its divisions", () => {
    expect(ticketScopeFilters({ client: "Thermax", divisions: ["Thermax-HTG"] })).toEqual([
      ["client", "=", "Thermax"],
      ["division", "in", ["Thermax-HTG"]],
    ]);
  });

  it("asks for NOTHING when the contact holds no divisions", () => {
    // The inversion this file exists to catch. `["division","in",[]]` matches no row;
    // omitting the filter matches every row the server is willing to return. If a server
    // regression ever widened that, the difference is the whole tenant boundary.
    const filters = ticketScopeFilters({ client: "Thermax", divisions: [] });
    expect(filters).toContainEqual(["division", "in", []]);
    expect(filters).toHaveLength(2);
  });

  it("still constrains by division when the list is missing entirely", () => {
    expect(ticketScopeFilters({ client: "Thermax" })).toContainEqual(["division", "in", []]);
  });

  it("sends no filters for a staff session", () => {
    // Not a hole: the server scopes agents by assignment, team and collaboration, which
    // the browser cannot express. Filtering here would narrow it wrongly, not widen it.
    expect(ticketScopeFilters(undefined)).toEqual([]);
  });

  it("sends no filters when a scope object carries no client", () => {
    expect(ticketScopeFilters({ divisions: ["Thermax-HTG"] })).toEqual([]);
  });

  it("composes with scopeFor end to end", () => {
    // The pair is what actually runs: session -> scope -> filters. Testing them apart
    // would miss a mismatch at the seam.
    expect(ticketScopeFilters(scopeFor(client({ divisions: ["A", "B"] })))).toEqual([
      ["client", "=", "Thermax"],
      ["division", "in", ["A", "B"]],
    ]);
    expect(ticketScopeFilters(scopeFor(staff()))).toEqual([]);
    expect(ticketScopeFilters(scopeFor(client({ divisions: [] })))).toContainEqual(["division", "in", []]);
  });
});
