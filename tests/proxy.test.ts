/**
 * The server-side auth gate (proxy.ts — Next 16's renamed middleware).
 *
 * This had no tests. It is the first thing every request to an app route passes through,
 * it decides whether protected page JS is served at all, and its matcher has already been
 * the cause of two distinct production faults documented in the file itself. Frappe stays
 * the authority on real authorization; this is the fast redirect in front of it, and a
 * mistake here is either an auth bypass or an app nobody can log into.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { proxy, config } from "../proxy";

/** A request with an optional `sid` cookie, the only thing the gate reads. */
function req(path: string, sid?: string) {
  const r = new NextRequest(`https://helpdesk.test${path}`);
  if (sid !== undefined) r.cookies.set("sid", sid);
  return r;
}

/** Where a response redirects to, or null when it passes through. */
function redirectTo(res: ReturnType<typeof proxy>): string | null {
  const loc = res.headers.get("location");
  return loc ? new URL(loc).pathname + new URL(loc).search : null;
}

describe("proxy — signed-out requests", () => {
  it("sends a request with no session to /login", () => {
    expect(redirectTo(proxy(req("/tickets")))).toBe("/login?next=%2Ftickets");
  });

  it("treats a Guest sid as no session", () => {
    // Frappe issues a real cookie for the anonymous user, so presence alone is not proof
    // of a session — reading it as one would let a signed-out visitor past the gate.
    expect(redirectTo(proxy(req("/tickets", "Guest")))).toBe("/login?next=%2Ftickets");
  });

  it("preserves the query string in ?next, so a filtered view survives sign-in", () => {
    const to = redirectTo(proxy(req("/tickets?status=New&client=Thermax")));
    expect(to).toBe("/login?next=%2Ftickets%3Fstatus%3DNew%26client%3DThermax");
  });

  it("does not add ?next for the root, which would round-trip to itself", () => {
    expect(redirectTo(proxy(req("/")))).toBe("/login");
  });

  it("strips any inherited query from the redirect target itself", () => {
    // url.search is cleared before ?next is set; without that the destination would carry
    // both the original params and the encoded copy.
    const to = redirectTo(proxy(req("/portal?a=1")));
    expect(to).toBe("/login?next=%2Fportal%3Fa%3D1");
    expect(to?.startsWith("/login?next=")).toBe(true);
  });
});

describe("proxy — public paths are never gated", () => {
  it.each(["/login", "/set-password"])("lets %s through with no session", (path) => {
    expect(redirectTo(proxy(req(path)))).toBeNull();
  });

  it("lets a sub-path of a public route through", () => {
    // The check is `=== p || startsWith(p + "/")`, so /set-password/anything is public.
    expect(redirectTo(proxy(req("/set-password/step-2")))).toBeNull();
  });

  it("does NOT treat a lookalike prefix as public", () => {
    // "/loginhijack" must not pass merely because it starts with "/login" — the guard
    // requires an exact match or a trailing slash, and this pins that.
    expect(redirectTo(proxy(req("/loginhijack")))).toBe("/login?next=%2Floginhijack");
  });
});

describe("proxy — a live session passes through", () => {
  it.each(["/tickets", "/portal", "/clients", "/"])("serves %s with a sid", (path) => {
    expect(redirectTo(proxy(req(path, "abc123")))).toBeNull();
  });
});

describe("proxy — the matcher, which has caused two faults already", () => {
  // config.matcher is what Next compiles to decide whether the gate runs at all. Testing
  // the exported pattern is the only way to cover it: the function itself never sees the
  // paths the matcher excludes.
  const matches = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

  it.each([
    ["/api/frappe/method/login", "proxied backend call, not a page"],
    ["/socket.io", "realtime handshake — gating it answered long-polls with a login page"],
    ["/socket.io/?EIO=4", "the trailing-slash form every Engine.IO request uses"],
    ["/frappe-files/logo.png", "proxied file"],
    ["/_next/static/chunk.js", "build asset"],
    ["/favicon.ico", "favicon"],
  ])("excludes %s (%s)", (path) => {
    expect(matches(path)).toBe(false);
  });

  it("escapes the dot in socket\\.io, so a lookalike path is still gated", () => {
    // An unescaped dot is "any character", which also excluded /socketXio from the auth
    // gate entirely. The file documents this; nothing asserted it until now.
    expect(matches("/socketXio")).toBe(true);
  });

  it.each(["/tickets", "/portal/tickets/THX-HTG-0001", "/clients", "/"])(
    "still gates the app route %s",
    (path) => {
      expect(matches(path)).toBe(true);
    },
  );
});
