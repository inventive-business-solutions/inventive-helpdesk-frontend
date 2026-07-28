/**
 * Paging that resets itself when the list is re-filtered.
 *
 * Replaces `useEffect(() => setPage(1), [q, sort])`, repeated at eight call sites. That
 * version is not wrong, it is just late: React renders with the new filter and the OLD page,
 * commits, then the effect corrects it. For one paint the list is on a page that no longer
 * exists — "Page 4 of 1" — and the pager buttons are computed from it.
 *
 * Deriving instead means the out-of-range state never exists at all. These cover the
 * derivation; the hook around it is three lines with no branching of its own.
 */
import { describe, it, expect } from "vitest";
import { sameDeps, pageFor } from "../lib/usePagedState";

describe("sameDeps", () => {
  it("compares positionally, like useEffect's own dependency check", () => {
    expect(sameDeps(["a", 1], ["a", 1])).toBe(true);
    expect(sameDeps(["a", 1], ["a", 2])).toBe(false);
    expect(sameDeps(["a", 1], [1, "a"])).toBe(false);
  });

  it("treats a different length as different", () => {
    // A page that grows a filter should not keep a page number from before it existed.
    expect(sameDeps(["a"], ["a", "b"])).toBe(false);
  });

  it("uses Object.is, so NaN matches itself", () => {
    // A numeric filter can produce NaN, and `NaN !== NaN` would reset the page forever —
    // every render would look like a filter change.
    expect(sameDeps([NaN], [NaN])).toBe(true);
  });

  it("distinguishes 0 from -0 the way Object.is does, not ===", () => {
    expect(sameDeps([0], [-0])).toBe(false);
  });

  it("two empty dep lists are the same", () => {
    expect(sameDeps([], [])).toBe(true);
  });
});

describe("pageFor", () => {
  const stored = { deps: ["acme", "name"], page: 4 };

  it("keeps the page while the filter is unchanged", () => {
    expect(pageFor(stored, ["acme", "name"])).toBe(4);
  });

  it("returns to the first page the instant a filter differs", () => {
    // The point: this is the value DURING the render that has the new filter, so no paint
    // ever shows page 4 of a one-page list.
    expect(pageFor(stored, ["beta", "name"])).toBe(1);
  });

  it("returns to the first page when the sort changes too", () => {
    expect(pageFor(stored, ["acme", "date"])).toBe(1);
  });

  it("does not resurrect an old page when the filter returns to its previous value", () => {
    // Cleared back to "acme" — but the stored page was orphaned when it changed away, and
    // whatever page was set since belongs to the newer deps.
    const afterChange = { deps: ["beta", "name"], page: 2 };
    expect(pageFor(afterChange, ["acme", "name"])).toBe(1);
  });

  it("starts on page 1 for a freshly stored list", () => {
    expect(pageFor({ deps: ["x"], page: 1 }, ["x"])).toBe(1);
  });
});
