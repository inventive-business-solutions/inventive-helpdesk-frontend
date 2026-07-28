"use client";
import { useState } from "react";

/**
 * The current page of a list, reset to 1 whenever the list is re-filtered.
 *
 * Eight call sites all wrote the same thing:
 *
 *     const [page, setPage] = useState(1);
 *     useEffect(() => setPage(1), [q, sort]);
 *
 * That works, and it costs a committed render every time a filter changes: React renders
 * with the new filter and the OLD page, commits, runs the effect, then renders again. On a
 * list that means one paint showing "Page 4 of 1" before the correction lands. It is also
 * what `react-hooks/set-state-in-effect` flags, eight times.
 *
 * The fix is to stop treating the reset as an event. Page 1 is not something that HAPPENS
 * when the filter changes — it is what the page IS for a filter nobody has paged through
 * yet. So the stored page is tagged with the deps it belongs to, and a stored page whose
 * tag no longer matches is simply not this list's page. No effect, no second render, and no
 * intermediate state where the page is out of range.
 *
 * The decision is a pure function (`pageFor`) so it can be tested without a DOM; the hook
 * below is the three lines of React glue around it.
 */

/** Same deps, positionally, by Object.is — the comparison useEffect itself uses. */
export function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/** The page to render: the stored one if it belongs to these deps, otherwise the first. */
export function pageFor(stored: { deps: readonly unknown[]; page: number }, deps: readonly unknown[]) {
  return sameDeps(stored.deps, deps) ? stored.page : 1;
}

/**
 * Drop-in for `useState(1)` plus the reset effect.
 *
 * `deps` is read like useEffect's: list everything that should send the reader back to the
 * first page. Unlike useEffect there is no lint exemption to think about, because nothing
 * here runs after the render.
 */
export function usePagedState(deps: readonly unknown[]): [number, (page: number) => void] {
  const [stored, setStored] = useState<{ deps: readonly unknown[]; page: number }>({ deps, page: 1 });
  // Tag every write with the deps it was made under, so the next filter change orphans it
  // rather than carrying a page number across to a different list.
  return [pageFor(stored, deps), (page: number) => setStored({ deps, page })];
}
