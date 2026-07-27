/**
 * Every whitelisted method this client calls must have a rewrite in next.config.mjs.
 *
 * The rewrite table is an explicit per-method allowlist, and it is frozen into
 * routes-manifest.json at build time. A method missing from it is not a 500 with a
 * message — it is a 404 from Next itself, which the UI surfaces as "Something went
 * wrong". Nothing local catches it: typecheck passes (the string is just a string), lint
 * passes, and the unit tests never make a network call. It only fails in a browser, on a
 * deployed build.
 *
 * That is exactly how `delete_product` shipped to production broken: the endpoint existed,
 * the client called it, and the proxy dropped it on the floor. Worse, deleting a product
 * had previously gone through the generic /resource route, so the regression replaced a
 * real error message with a meaningless one.
 *
 * This asserts the two files agree. It is a text comparison rather than a running proxy
 * because the failure is a missing entry, which the text shows directly.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const read = (f: string) => readFileSync(join(__dirname, "..", f), "utf8");
const client = read("lib/frappe.ts");
const config = read("next.config.mjs");

/** Methods the client calls: `call("<dotted>")` and `request("/method/<dotted>")`. */
function methodsCalled(): string[] {
  const found = new Set<string>();
  for (const m of client.matchAll(/call<[^>]*>\(\s*"([^"]+)"/g)) found.add(m[1]);
  for (const m of client.matchAll(/\bcall\(\s*"([^"]+)"/g)) found.add(m[1]);
  for (const m of client.matchAll(/request<[^>]*>\(\s*"\/method\/([^"?]+)"/g)) found.add(m[1]);
  for (const m of client.matchAll(/\brequest\(\s*"\/method\/([^"?]+)"/g)) found.add(m[1]);
  return [...found];
}

/** Methods the proxy will forward, from the `source:` entries. */
function methodsAllowed(): Set<string> {
  const allowed = new Set<string>();
  for (const m of config.matchAll(/source:\s*"\/api\/frappe\/method\/([^"]+)"/g)) allowed.add(m[1]);
  return allowed;
}

describe("proxy allowlist covers every method the client calls", () => {
  it("finds the calls at all — a silent zero would make this test vacuous", () => {
    // If the client's call style is ever refactored, the regexes above stop matching and
    // every assertion below would pass against an empty set. Fail loudly instead.
    expect(methodsCalled().length).toBeGreaterThan(10);
  });

  it("has a rewrite for each one", () => {
    const allowed = methodsAllowed();
    const missing = methodsCalled().filter((m) => !allowed.has(m));
    expect(missing, `missing from next.config.mjs rewrites: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers delete_product specifically", () => {
    // The one that shipped broken. Named on its own so a regression reads as itself
    // rather than as a generic list diff.
    expect(methodsAllowed().has("inventive_helpdesk_backend.api.delete_product")).toBe(true);
  });
});
