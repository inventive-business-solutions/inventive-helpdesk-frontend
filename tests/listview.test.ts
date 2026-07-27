/**
 * The list sort/search primitives.
 *
 * These decide the order every master-data page renders in, and the failure mode is quiet:
 * a comparator that is subtly wrong does not throw, it just puts the record you were
 * looking for somewhere you will not look. The specific complaint that prompted this
 * feature — a newly added client appearing at the BOTTOM of the list — is exactly that
 * kind of bug, so the ordering guarantees are pinned here rather than eyeballed.
 */
import { describe, it, expect } from "vitest";
import { applySort, byName, commonSorts, countSort, matches } from "../lib/listview";
import type { Stamped } from "../types";

type Row = Stamped & { name: string };

const row = (name: string, created?: string, updated?: string): Row => ({
  name,
  createdISO: created,
  updatedISO: updated,
});

const sorts = commonSorts<Row>(
  (r) => r.name,
  (r) => r,
);
const names = (rows: Row[], key: string) => applySort(rows, sorts, key).map((r) => r.name);

// Frappe's own timestamp format — space-separated, microseconds, no timezone.
const T = (s: string) => `2026-07-${s}.000000`;

describe("commonSorts — date orders", () => {
  const rows = [
    row("Alpha", T("01 10:00:00"), T("01 10:00:00")),
    row("Bravo", T("20 09:00:00"), T("25 18:00:00")),
    row("Charlie", T("10 12:00:00"), T("11 08:00:00")),
  ];

  it("puts the most recently updated first", () => {
    expect(names(rows, "updated")).toEqual(["Bravo", "Charlie", "Alpha"]);
  });

  it("puts the newest created first", () => {
    expect(names(rows, "created")).toEqual(["Bravo", "Charlie", "Alpha"]);
  });

  it("oldest is the exact reverse of newest", () => {
    expect(names(rows, "oldest")).toEqual([...names(rows, "created")].reverse());
  });

  // The bug that started this: a record created today must not land at the bottom.
  it("surfaces a just-added record at the top under both date sorts", () => {
    const fresh = row("Zenith", T("27 23:59:00"), T("27 23:59:00"));
    expect(names([...rows, fresh], "created")[0]).toBe("Zenith");
    expect(names([...rows, fresh], "updated")[0]).toBe("Zenith");
  });

  // Frappe timestamps are fixed-width and zero-padded, so a string compare is
  // chronological — but only if the comparator does not accidentally compare Dates or
  // numbers. A day that sorts before a month would silently break the whole feature.
  it("orders across month and day boundaries, not lexically by digit", () => {
    const rows2 = [
      row("Sep", "2026-09-01 00:00:00.000000"),
      row("Oct", "2026-10-01 00:00:00.000000"),
      row("Aug", "2026-08-09 00:00:00.000000"),
    ];
    expect(names(rows2, "created")).toEqual(["Oct", "Sep", "Aug"]);
  });
});

describe("commonSorts — missing stamps", () => {
  it("sorts a record with no timestamp LAST, not as if it were epoch", () => {
    const rows = [row("NoDate"), row("Old", T("01 00:00:00")), row("New", T("26 00:00:00"))];
    expect(names(rows, "created")).toEqual(["New", "Old", "NoDate"]);
  });

  // Both directions: "Oldest first" must not promote the unknown record to the top either.
  it("keeps an undated record last even when sorting oldest-first", () => {
    const rows = [row("NoDate"), row("Old", T("01 00:00:00")), row("New", T("26 00:00:00"))];
    expect(names(rows, "oldest")).toEqual(["Old", "New", "NoDate"]);
  });

  it("falls back to name order when nothing is stamped", () => {
    expect(names([row("Charlie"), row("Alpha"), row("Bravo")], "updated")).toEqual([
      "Alpha",
      "Bravo",
      "Charlie",
    ]);
  });
});

describe("commonSorts — stability", () => {
  // A bulk import stamps many rows in the same second. Without a tiebreak those rows come
  // out in array order and can shuffle between renders, which reads as the list flickering.
  it("breaks identical timestamps by name rather than by array position", () => {
    const same = T("15 12:00:00");
    const rows = [row("Delta", same, same), row("Alpha", same, same), row("Charlie", same, same)];
    expect(names(rows, "updated")).toEqual(["Alpha", "Charlie", "Delta"]);
    // Same input in a different order must produce the same output.
    expect(names([rows[2], rows[0], rows[1]], "updated")).toEqual(["Alpha", "Charlie", "Delta"]);
  });
});

describe("commonSorts — name orders", () => {
  it("A–Z ignores case", () => {
    expect(names([row("beta"), row("Alpha"), row("CHARLIE")], "az")).toEqual(["Alpha", "beta", "CHARLIE"]);
  });

  it("Z–A is the exact reverse of A–Z", () => {
    const rows = [row("beta"), row("Alpha"), row("CHARLIE")];
    expect(names(rows, "za")).toEqual([...names(rows, "az")].reverse());
  });

  it("byName treats accents as equivalent to their base letter", () => {
    expect(byName("Ápex", "Apex")).toBe(0);
    expect(byName("Apex", "Banner")).toBeLessThan(0);
  });
});

describe("countSort", () => {
  const counts = new Map([
    ["Alpha", 3],
    ["Bravo", 10],
  ]);
  const sort = countSort<Row>(
    "tickets",
    "Most tickets",
    (r) => counts.get(r.name) ?? 0,
    (r) => r.name,
  );

  it("orders by count descending", () => {
    const out = applySort([row("Alpha"), row("Zulu"), row("Bravo")], [sort], "tickets");
    expect(out.map((r) => r.name)).toEqual(["Bravo", "Alpha", "Zulu"]);
  });

  it("breaks equal counts by name", () => {
    const out = applySort([row("Yankee"), row("Xray")], [sort], "tickets");
    expect(out.map((r) => r.name)).toEqual(["Xray", "Yankee"]);
  });
});

describe("applySort", () => {
  it("does not mutate the array it is given", () => {
    // The arrays passed in come straight from the Zustand store; sorting in place would
    // reorder the store's own state as a side effect of rendering.
    const rows = [row("Charlie"), row("Alpha")];
    const before = rows.map((r) => r.name);
    applySort(rows, sorts, "az");
    expect(rows.map((r) => r.name)).toEqual(before);
  });

  it("returns the input untouched for an unknown sort key", () => {
    const rows = [row("Charlie"), row("Alpha")];
    expect(applySort(rows, sorts, "no-such-sort").map((r) => r.name)).toEqual(["Charlie", "Alpha"]);
  });
});

describe("matches", () => {
  it("matches everything on an empty or whitespace query", () => {
    expect(matches("", "anything")).toBe(true);
    expect(matches("   ", "anything")).toBe(true);
  });

  it("is case-insensitive and matches substrings", () => {
    expect(matches("THER", "Thermax")).toBe(true);
    expect(matches("max", "Thermax")).toBe(true);
  });

  it("matches if ANY field hits", () => {
    expect(matches("priya", "Acme Corp", "priya@acme.test")).toBe(true);
  });

  it("ignores undefined and null fields instead of throwing", () => {
    expect(matches("acme", undefined, null, "Acme")).toBe(true);
    expect(matches("acme", undefined, null)).toBe(false);
  });

  it("does not match when nothing contains the query", () => {
    expect(matches("zzz", "Acme Corp", "priya@acme.test")).toBe(false);
  });
});
