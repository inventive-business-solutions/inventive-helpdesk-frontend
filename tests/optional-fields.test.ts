/**
 * `getList({ optional })` — a field the backend has not migrated yet must not take the app down.
 *
 * What happened: `lead` was added to the Assignment Group query in this repo before the
 * matching migration had run on the backend. Frappe validates every requested field against
 * the doctype and rejects the WHOLE query when one is unknown — so the failure was not "team
 * cards show no lead", it was "Field not permitted in query: lead" on the sign-in screen,
 * with nobody able to log in. An optional cosmetic column caused a total outage.
 *
 * Deploy order prevents it and is documented, but discipline means one slip is an outage.
 * These tests pin the safety net instead: the full query is still tried first, the retry only
 * happens on failure, and a real failure still throws rather than being smoothed over.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getList } from "../lib/frappe";

/** Captured `fields` per call, so a test can assert what was actually asked for. */
let calls: string[][] = [];
const okRow = { name: "CAD" };

/** Stand in for the network. `reject` decides which requests fail, by requested fields.
 *  `request` reads the body with res.text() and parses it itself, so the stub must too —
 *  a `json()`-only stub passes nothing through and fails for the wrong reason. */
function stubFetch(reject: (fields: string[]) => boolean) {
  return vi.fn(async (url: string) => {
    const fields = JSON.parse(new URL(url, "http://x").searchParams.get("fields") ?? "[]");
    calls.push(fields);
    if (reject(fields)) {
      const messages = [JSON.stringify({ message: "Field not permitted in query: lead" })];
      return {
        ok: false,
        status: 417,
        statusText: "Expectation Failed",
        text: async () => JSON.stringify({ _server_messages: JSON.stringify(messages) }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: [okRow] }),
    } as unknown as Response;
  });
}

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getList with optional fields", () => {
  it("asks for everything first, and does not retry when that works", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch(() => false),
    );
    const rows = await getList("Assignment Group", {
      fields: ["name", "group_name", "lead"],
      optional: ["lead"],
    });
    expect(rows).toEqual([okRow]);
    // One call, WITH the optional field. A migrated backend pays nothing for this feature.
    expect(calls).toEqual([["name", "group_name", "lead"]]);
  });

  it("retries without the optional field when the backend rejects it", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch((f) => f.includes("lead")),
    );
    const rows = await getList("Assignment Group", {
      fields: ["name", "group_name", "lead"],
      optional: ["lead"],
    });
    expect(rows).toEqual([okRow]); // sign-in proceeds
    expect(calls).toEqual([
      ["name", "group_name", "lead"],
      ["name", "group_name"],
    ]);
  });

  it("still throws when the retry fails too, so a real outage is not hidden", async () => {
    // Every request fails — the backend is down, not merely behind on migrations.
    vi.stubGlobal(
      "fetch",
      stubFetch(() => true),
    );
    await expect(
      getList("Assignment Group", { fields: ["name", "lead"], optional: ["lead"] }),
    ).rejects.toThrow();
    expect(calls).toHaveLength(2); // tried, then tried degraded, then gave up
  });

  it("does not retry at all when no fields are marked optional", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch(() => true),
    );
    await expect(getList("Assignment Group", { fields: ["name", "lead"] })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("throws rather than sending an empty query when the optional fields were the whole ask", async () => {
    // Degrading to `fields: []` would ask Frappe for nothing and "succeed" with useless rows.
    vi.stubGlobal(
      "fetch",
      stubFetch(() => true),
    );
    await expect(getList("Assignment Group", { fields: ["lead"], optional: ["lead"] })).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
