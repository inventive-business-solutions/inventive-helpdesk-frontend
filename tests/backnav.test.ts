/**
 * Where Back goes.
 *
 * The bug this replaced: Back called `router.back()`, so it mirrored browser history. Reach
 * Clients from Tickets, press Back to get to Tickets, and Tickets' own Back returns to
 * Clients — two pages ping-ponging for as long as anyone keeps pressing. A control that
 * lands somewhere different each press, depending on how you arrived, is not navigation.
 *
 * The destination is now always stated: `?from=` if a link carried it, else the page's
 * fallback. Both are fixed points, which is what makes the loop impossible.
 */
import { describe, it, expect, afterEach } from "vitest";
import { withOrigin, originFromUrl } from "../components/ui/BackButton";

/** Stand in for the browser's location, which is all originFromUrl reads. */
const at = (search: string) => {
  // @ts-expect-error — assigning a minimal stub over the jsdom-less global.
  globalThis.window = { location: { search } };
};
afterEach(() => {
  // @ts-expect-error — same stub, removed so tests stay independent.
  delete globalThis.window;
});

describe("withOrigin", () => {
  it("adds `from` with ? when the href has no query", () => {
    expect(withOrigin("/tickets", "/clients")).toBe("/tickets?from=%2Fclients");
  });

  it("adds `from` with & when the href already has a query", () => {
    expect(withOrigin("/tickets?client=Acme", "/clients")).toBe("/tickets?client=Acme&from=%2Fclients");
  });

  it("encodes an origin that itself carries a query, so it survives as ONE param", () => {
    // A ticket opened from a filtered list: the whole filtered URL is the origin. Without
    // encoding, its own `&` would split into sibling params and the origin would be lost.
    const out = withOrigin("/tickets/THX-0042", "/tickets?client=Acme&status=New");
    expect(out).toBe("/tickets/THX-0042?from=%2Ftickets%3Fclient%3DAcme%26status%3DNew");
    expect(new URLSearchParams(out.split("?")[1]).get("from")).toBe("/tickets?client=Acme&status=New");
  });
});

describe("originFromUrl", () => {
  it("returns the origin when one was carried in", () => {
    at("?client=Acme&from=%2Fclients");
    expect(originFromUrl()).toBe("/clients");
  });

  it("round-trips an origin that has its own query string", () => {
    at(`?from=${encodeURIComponent("/tickets?client=Acme&status=New")}`);
    expect(originFromUrl()).toBe("/tickets?client=Acme&status=New");
  });

  it("returns null when no origin was carried, so the caller uses its fallback", () => {
    at("?client=Acme");
    expect(originFromUrl()).toBeNull();
    at("");
    expect(originFromUrl()).toBeNull();
  });

  // Open-redirect guard. `from` comes off the URL, so anyone can put anything in it, and a
  // bare startsWith("/") check is not enough: "//evil.com" is a protocol-relative URL that
  // navigates straight off-site while looking like a path.
  it("refuses a protocol-relative URL", () => {
    at("?from=%2F%2Fevil.com");
    expect(originFromUrl()).toBeNull();
  });

  it("refuses an absolute off-site URL", () => {
    at(`?from=${encodeURIComponent("https://evil.com")}`);
    expect(originFromUrl()).toBeNull();
  });

  it("refuses a scheme that is not a path at all", () => {
    at(`?from=${encodeURIComponent("javascript:alert(1)")}`);
    expect(originFromUrl()).toBeNull();
  });

  it("returns null off the browser, rather than throwing during a server render", () => {
    expect(originFromUrl()).toBeNull();
  });
});
