"use client";
/**
 * Shared search + sort for the master-data lists (Clients, Contacts, Products, Team,
 * Groups).
 *
 * Sorting is client-side on purpose. Every one of these lists is fetched with `limit: 0`
 * and assembled in the browser, so the full set is already in memory — a round-trip per
 * sort change would be slower and would buy nothing. It also keeps sorting working on
 * derived rows (a contact's client, a product's client count) that no `order_by` can
 * express, because those values do not exist as columns on the record being sorted.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { Stamped } from "@/types";

export interface SortOption<T> {
  key: string;
  label: string;
  /** Standard comparator: negative if `a` comes first. */
  compare: (a: T, b: T) => number;
}

/** The default for every section. Chosen because the complaint this feature answers was
 *  that a newly added record landed at the bottom of the list — under "Recently updated"
 *  anything you just created or edited is the first thing you see. */
export const DEFAULT_SORT = "updated";

/** Compare two Frappe timestamps, newest first.
 *
 *  Frappe returns "YYYY-MM-DD HH:MM:SS.ffffff" — fixed-width and zero-padded, so a
 *  lexicographic compare is already chronological and there is no need to build a Date
 *  per comparison (which, at O(n log n) comparisons, is the expensive way to do this).
 *
 *  A missing stamp sorts LAST rather than being treated as epoch. A record with no date
 *  is unknown, not ancient, and pushing it to the top of a "Newest" list would be a lie;
 *  burying it is the less surprising failure. */
const newestFirst = (a?: string, b?: string) => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? 1 : -1;
};

/** Oldest first — and NOT `-newestFirst(...)`, which is the tempting one-liner and is
 *  wrong: negating the whole result also negates the missing-stamp rule, so undated
 *  records would jump to the TOP of an "Oldest first" list. Only the date comparison
 *  reverses; unknown stays last in both directions. */
const oldestFirst = (a?: string, b?: string) => {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a < b ? -1 : 1;
};

/** Case- and accent-insensitive name compare, so "Ápex" files next to "Apex" and casing
 *  never decides the order. */
export const byName = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: "base" });

/**
 * The five sorts every section shares.
 *
 * Each date sort falls back to the name on a tie. Without that tiebreak, records sharing
 * a timestamp — which is routine, since a bulk import or a migration stamps many rows in
 * the same second — would come out in whatever order the array happened to hold, and
 * could reorder between renders. A stable, meaningful tiebreak makes the list calm.
 */
export function commonSorts<T>(
  nameOf: (x: T) => string,
  /** Where the timestamps live. Usually the record itself, but the Contacts table lists
   *  one row per contact-division pairing, so the row wraps the stamped POC rather than
   *  being stamped itself — hence an accessor instead of a `T extends Stamped` bound. */
  stampOf: (x: T) => Stamped,
): SortOption<T>[] {
  const tie = (a: T, b: T) => byName(nameOf(a), nameOf(b));
  return [
    {
      key: "updated",
      label: "Recently updated",
      compare: (a, b) => newestFirst(stampOf(a).updatedISO, stampOf(b).updatedISO) || tie(a, b),
    },
    {
      key: "created",
      label: "Newest first",
      compare: (a, b) => newestFirst(stampOf(a).createdISO, stampOf(b).createdISO) || tie(a, b),
    },
    {
      key: "oldest",
      label: "Oldest first",
      compare: (a, b) => oldestFirst(stampOf(a).createdISO, stampOf(b).createdISO) || tie(a, b),
    },
    { key: "az", label: "Name A–Z", compare: tie },
    { key: "za", label: "Name Z–A", compare: (a, b) => -tie(a, b) },
  ];
}

/** Build a "most X first" sort from a count lookup, ties broken by name. Used for
 *  "Most tickets" (Clients, Team) and "Most clients" (Products) — counts that are derived
 *  in the browser and so could never come from the server's `order_by`. */
export function countSort<T>(
  key: string,
  label: string,
  countOf: (x: T) => number,
  nameOf: (x: T) => string,
): SortOption<T> {
  return {
    key,
    label,
    compare: (a, b) => countOf(b) - countOf(a) || byName(nameOf(a), nameOf(b)),
  };
}

/** Sort a COPY. The arrays these run on come straight from the store, and Array#sort
 *  mutates — sorting in place would reorder the store's own state as a side effect of
 *  rendering, which is exactly the kind of bug that only shows up two screens later. */
export function applySort<T>(items: T[], options: SortOption<T>[], key: string): T[] {
  const opt = options.find((o) => o.key === key);
  return opt ? [...items].sort(opt.compare) : items;
}

/** Case-insensitive substring match across several fields. Empty query matches
 *  everything, so callers can pass the raw input without guarding. */
export function matches(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => !!f && f.toLowerCase().includes(q));
}

const KEY_PREFIX = "ihd.sort.";
const storageKey = (section: string) => `${KEY_PREFIX}${section}`;

/** Same-tab subscribers, keyed by storage key. The `storage` event fires in OTHER tabs
 *  only, so a write here has to tell this tab's own hooks itself or the control would not
 *  re-render — but only the hooks watching THAT key. A single shared set woke every
 *  mounted section on any sort change, which is wasted work the moment two lists share a
 *  screen. */
const listeners = new Map<string, Set<() => void>>();

const notify = (key: string) => listeners.get(key)?.forEach((l) => l());

const subscribeTo = (key: string) => (cb: () => void) => {
  const set = listeners.get(key) ?? new Set();
  set.add(cb);
  listeners.set(key, set);
  // Cross-tab: two tabs open on Clients should not disagree about the sort.
  window.addEventListener("storage", cb);
  return () => {
    set.delete(cb);
    if (!set.size) listeners.delete(key);
    window.removeEventListener("storage", cb);
  };
};

/** Drop every remembered sort. Called on sign-out: these live in localStorage, which is
 *  per-browser rather than per-account, so on a shared machine they would otherwise carry
 *  from one person's session into the next. */
export function clearStoredSorts() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(KEY_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
    listeners.forEach((set) => set.forEach((l) => l()));
  } catch {
    /* storage unavailable — there was nothing stored to clear */
  }
}

const read = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    /* storage unavailable (private mode, blocked cookies) — fall back to the default */
    return null;
  }
};

/**
 * Sort choice for one section, remembered per browser.
 *
 * `useSyncExternalStore` rather than `useState` + an effect. localStorage is external
 * state, and these pages are client components that Next still server-renders for the
 * initial HTML — where localStorage does not exist. The server snapshot returns null so
 * the markup renders at the default, and React swaps in the stored value on hydration
 * without a mismatch and without a setState-in-effect cascade.
 *
 * An unknown stored key — a sort since renamed or removed — is ignored rather than
 * applied, so a stale entry degrades to the default instead of silently sorting by
 * nothing.
 */
export function useStoredSort(
  section: string,
  validKeys: string[],
  fallback: string = DEFAULT_SORT,
): [string, (key: string) => void] {
  const key = storageKey(section);
  // Memoised: useSyncExternalStore resubscribes whenever `subscribe` changes identity, so
  // a fresh closure each render would tear the listener down and rebuild it every time.
  const subscribe = useMemo(() => subscribeTo(key), [key]);
  const stored = useSyncExternalStore(
    subscribe,
    () => read(key),
    () => null,
  );

  const choose = useCallback(
    (next: string) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        /* nothing to do — without storage the choice cannot persist, and re-rendering
           would only put the control back where it was */
      }
      notify(key);
    },
    [key],
  );

  return [stored && validKeys.includes(stored) ? stored : fallback, choose];
}
