/**
 * Which tier a signed-in session is shown as.
 *
 * The sidebar hardcoded "Administrator" for every manager, so the person who can delegate
 * and the people who cannot read identically — in the one place a user looks to know what
 * they are. Pinned because it is derived from two independent flags and the precedence
 * between them is easy to get backwards.
 */
import { describe, it, expect } from "vitest";
import { TIER, tierLabel } from "../lib/tiers";
import type { Session } from "../types";

const s = (over: Partial<Session>): Session =>
  ({
    role: "admin",
    manage: false,
    isOwner: false,
    name: "X",
    user: "x@y.z",
    teams: [],
    divisions: [],
    ...over,
  }) as Session;

describe("tierLabel", () => {
  it("calls the delegating tier Lead Admin", () => {
    expect(tierLabel(s({ manage: true, isOwner: true }))).toBe(TIER.owner);
  });

  it("calls a delegated manager Administrator", () => {
    expect(tierLabel(s({ manage: true, isOwner: false }))).toBe(TIER.admin);
  });

  it("calls a non-manager staff member an Agent", () => {
    expect(tierLabel(s({ manage: false, isOwner: false }))).toBe(TIER.agent);
  });

  // Owner outranks manage. An owner always has manage too, so reading `manage` first
  // would label the Lead Admin "Administrator" — the exact bug this replaces.
  it("prefers owner over manager when both are set", () => {
    expect(tierLabel(s({ manage: true, isOwner: true }))).not.toBe(TIER.admin);
  });

  it("gives a client no staff tier at all", () => {
    expect(tierLabel(s({ role: "client", manage: false }))).toBeNull();
  });
});
