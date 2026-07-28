/**
 * What an engagement's division scope resolves to before it is sent.
 *
 * Empty is not "unset" here — it is the value that means "attached to the client as a
 * whole", so getting it wrong does not throw, it silently changes who can see the product.
 * Two dialogs now share this rule (Add product, and attaching one to a client), which is
 * exactly why it lives in one tested place rather than being written out twice.
 */
import { describe, it, expect } from "vitest";
import { scopedDivisions } from "../lib/engagement";
import type { Client } from "../types";

const client = (divisions: string[]): Client => ({
  name: "Thermax",
  code: "THX",
  status: "Active",
  products: [],
  leads: [],
  unassigned: [],
  divisions: divisions.map((d) => ({ name: d, code: d.slice(0, 3).toUpperCase(), pocs: [] })),
});

const withDivs = client(["Heating", "Enviro"]);
const noDivs = client([]);

describe("scopedDivisions", () => {
  it("sends the ticked divisions when the scope is divisions", () => {
    expect(scopedDivisions("divisions", withDivs, ["Thermax-HTG"])).toEqual(["Thermax-HTG"]);
  });

  // The bug this guards: tick two divisions, change your mind, switch back to client-wide.
  // Reading the checklist directly would save a scoped engagement while the dialog said
  // client-wide — the UI and the record disagreeing about who can see the product.
  it("sends nothing for client-wide even when divisions are still ticked", () => {
    expect(scopedDivisions("client", withDivs, ["Thermax-HTG", "Thermax-ENV"])).toEqual([]);
  });

  it("sends nothing when the client has no divisions, whatever the scope says", () => {
    expect(scopedDivisions("divisions", noDivs, [])).toEqual([]);
    expect(scopedDivisions("divisions", noDivs, ["stale-value"])).toEqual([]);
  });

  it("sends nothing when no client is chosen yet", () => {
    expect(scopedDivisions("divisions", undefined, ["Thermax-HTG"])).toEqual([]);
  });

  it("returns an empty array rather than undefined, so the caller can always spread it", () => {
    expect(Array.isArray(scopedDivisions("client", withDivs, []))).toBe(true);
  });
});
