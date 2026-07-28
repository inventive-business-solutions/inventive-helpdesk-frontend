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
import { PostAuthError, UserError, FrappeError, asPostAuthError, displayableMessage } from "../lib/frappe";

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

/**
 * The activation screen showing a bare identifier.
 *
 * Reported from a real invite: a member opened their link, set a password, pressed
 * "Set password & sign in" — and the form came back with a single word in the error slot,
 * "me". That is the tail of `inventive_helpdesk_backend.api.me`, and it told them nothing
 * except that something was wrong. Worse, their password HAD been set, so the one thing the
 * screen implied — try again, it did not work — was false.
 *
 * Two independent faults, either of which alone would have prevented it:
 *
 *   1. store.setPassword did not wrap its post-activation half in asPostAuthError, so
 *      anything failing after the password was changed surfaced its own message. signIn has
 *      always wrapped exactly this half, with a comment explaining why.
 *   2. serverErrorMessage returned whatever string sat in the error body, and marked it
 *      `displayable` — which is the flag that says "safe to show a person".
 *
 * These cover the second. A message with no whitespace is an identifier, not prose.
 */
describe("serverErrorMessage never surfaces a bare identifier", () => {
  const bodyWith = (m: unknown) => ({ _server_messages: JSON.stringify([JSON.stringify({ message: m })]) });

  it("keeps a real sentence", () => {
    expect(displayableMessage(bodyWith("Your link has expired."))).toBe("Your link has expired.");
  });

  it("strips the HTML Frappe wraps names in, and keeps the sentence", () => {
    const msg = "Function <strong>inventive_helpdesk_backend.api.me</strong> is not whitelisted.";
    expect(displayableMessage(bodyWith(msg))).toBe(
      "Function inventive_helpdesk_backend.api.me is not whitelisted.",
    );
  });

  it("REFUSES a bare method name — the reported bug", () => {
    expect(displayableMessage(bodyWith("me"))).toBeNull();
    expect(displayableMessage(bodyWith("inventive_helpdesk_backend.api.me"))).toBeNull();
  });

  it("refuses a bare field or doctype name from the plain message field", () => {
    expect(displayableMessage({ message: "division" })).toBeNull();
    expect(displayableMessage({ message: "Client Product" })).toBe("Client Product");
  });

  it("refuses whitespace-only and empty", () => {
    expect(displayableMessage({ message: "   " })).toBeNull();
    expect(displayableMessage({ message: "" })).toBeNull();
    expect(displayableMessage({})).toBeNull();
  });
});
