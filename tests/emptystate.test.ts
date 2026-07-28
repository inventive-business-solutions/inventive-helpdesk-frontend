/**
 * The empty-list rule, and the four places that broke it.
 *
 * Reported as: a team showing "0 members" whose Add-member dialog said "Everyone is already
 * in this team." Both statements were on screen at once. The cause was not that message — it
 * was branching on the NARROWED list (`members` minus those already in the team), which
 * reaches zero both when everyone is in the team and when there are no members at all.
 *
 * The same mistake was in three more places, all invisible on a populated site and all
 * wrong on an empty one. The cases below are those four, by name.
 */
import { describe, it, expect } from "vitest";
import { emptyReason } from "../lib/emptyState";

describe("emptyReason", () => {
  it("reports an untouched empty source as empty, not as a filter result", () => {
    expect(emptyReason({ total: 0 })).toBe("empty");
    // Even with a search typed: nothing exists, so blaming the search is still wrong.
    expect(emptyReason({ total: 0, query: "acme" })).toBe("empty");
    expect(emptyReason({ total: 0, afterSearch: 0, query: "acme" })).toBe("empty");
  });

  it("blames the search only when a search actually excluded something", () => {
    expect(emptyReason({ total: 5, afterSearch: 0 })).toBe("search");
    expect(emptyReason({ total: 5, query: "zzz" })).toBe("search");
    // Survived the search, so something else is responsible.
    expect(emptyReason({ total: 5, afterSearch: 3 })).toBe("filtered");
    expect(emptyReason({ total: 5 })).toBe("filtered");
  });

  it("prefers the measured count over the query text when both are given", () => {
    // A query is set but everything survived it, so the tab or a facet is at fault --
    // echoing the query here would point the reader at the wrong control.
    expect(emptyReason({ total: 9, afterSearch: 9, query: "a" })).toBe("filtered");
  });

  describe("the four regressions", () => {
    it("AddGroupMemberModal: an empty team on a site with no members at all", () => {
      // The reported bug. 0 members exist; the team has 0. It said everyone was already in.
      expect(emptyReason({ total: 0 })).toBe("empty");
      // And the case the old message was actually written for, which must still say it.
      expect(emptyReason({ total: 4 })).toBe("filtered");
    });

    it("Tickets: an empty system with no filters set", () => {
      // What this site looked like after its tickets were cleared: it blamed the filters.
      expect(emptyReason({ total: 0 })).toBe("empty");
      expect(emptyReason({ total: 12, query: "refund" })).toBe("search");
      expect(emptyReason({ total: 12 })).toBe("filtered");
    });

    it("Products assigned tab: search hid them vs none exist", () => {
      expect(emptyReason({ total: 0, afterSearch: 0 })).toBe("empty");
      // Products exist, the search hid them -- not "nothing is assigned yet".
      expect(emptyReason({ total: 6, afterSearch: 0 })).toBe("search");
      // Products survived the search but none are assigned: the tab really is empty.
      expect(emptyReason({ total: 6, afterSearch: 6 })).toBe("filtered");
    });

    it("Products unassigned tab: never claim a catalogue is fully assigned when it is empty", () => {
      // The old text was "every product is being run by a client" -- asserted about a
      // catalogue it never checked the size of, and false whenever that size was zero.
      expect(emptyReason({ total: 0, afterSearch: 0 })).toBe("empty");
      expect(emptyReason({ total: 3, afterSearch: 3 })).toBe("filtered");
    });
  });
});
