/**
 * Which failure the sign-in screen blames.
 *
 * Signing in is four calls, not one: authenticate, read the session, load master data,
 * load tickets. Only the FIRST can fail because the password was wrong — but every failure
 * used to produce "Check your email and password". A real account reached the login screen
 * with no roles attached, 403'd on the third call, and was told to re-type a password that
 * was correct. Someone can spend a long time on that.
 */
import { describe, it, expect } from "vitest";
import { PostAuthError, UserError, FrappeError, asPostAuthError } from "../lib/frappe";

describe("asPostAuthError", () => {
  it("keeps a message the backend or store already wrote for a human", () => {
    const wrapped = asPostAuthError(new UserError("This account isn't set up for the support app."));
    expect(wrapped).toBeInstanceOf(PostAuthError);
    expect(wrapped.message).toBe("This account isn't set up for the support app.");
  });

  // The exact shape of the bug: authenticated fine, then 403 on master data.
  it("turns a bare 403 into a setup problem, never a credentials one", () => {
    const wrapped = asPostAuthError(new FrappeError("Forbidden", 403));
    expect(wrapped.message).toContain("password was accepted");
    expect(wrapped.message).not.toMatch(/check your (email|password)/i);
  });

  it("falls back to a load failure for anything else, still not blaming the password", () => {
    const wrapped = asPostAuthError(new TypeError("Failed to fetch"));
    expect(wrapped.message).toContain("password was accepted");
    expect(wrapped.message).not.toMatch(/check your (email|password)/i);
  });

  it("never surfaces an internal error string to the user", () => {
    // "Cannot read properties of undefined" must not reach a sign-in screen.
    expect(asPostAuthError(new TypeError("Cannot read properties of undefined")).message).not.toContain(
      "undefined",
    );
  });

  it("does not re-wrap something already classified", () => {
    const once = asPostAuthError(new FrappeError("Forbidden", 403));
    expect(asPostAuthError(once)).toBe(once);
  });

  it("is a UserError, so existing display paths still treat it as showable", () => {
    expect(asPostAuthError(new FrappeError("Forbidden", 403))).toBeInstanceOf(UserError);
  });

  it("keeps the original error as `cause` for logging", () => {
    const original = new FrappeError("Forbidden", 403);
    expect(asPostAuthError(original).cause).toBe(original);
  });
});
