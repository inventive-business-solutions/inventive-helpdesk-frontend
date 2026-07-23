import { describe, it, expect } from "vitest";
import { FrappeError, UserError, userFacingMessage } from "../lib/frappe";

// A failed write used to toast a flat "Something went wrong", swallowing the reason the
// backend gave — so an admin who reused an email address was told nothing about what to
// change. userFacingMessage decides what is safe to put on screen.
describe("userFacingMessage", () => {
  it("surfaces a validation message the backend wrote", () => {
    // The real payload: Frappe answers a duplicate-email insert with HTTP 417 and this
    // text in _server_messages; lib/frappe unwraps it before constructing the error.
    const err = new FrappeError(
      "arjun@example.com is already used by the team member “Arjun Deshpande”.",
      417,
      true,
    );
    expect(userFacingMessage(err)).toContain("already used by the team member");
  });

  it("surfaces a rule the store enforced client-side", () => {
    expect(userFacingMessage(new UserError("A member with that name already exists."))).toBe(
      "A member with that name already exists.",
    );
  });

  it("hides bare HTTP status text", () => {
    // "Internal Server Error" reads like advice but tells the user nothing, so the caller
    // falls back to its own generic line instead.
    expect(userFacingMessage(new FrappeError("Internal Server Error", 500))).toBeNull();
  });

  it("never leaks an unexpected runtime error", () => {
    // The reason this is an allowlist and not `err.message`: a TypeError has a message too.
    const bug = new TypeError("Cannot read properties of undefined (reading 'name')");
    expect(userFacingMessage(bug)).toBeNull();
  });

  it("ignores non-errors and empty messages", () => {
    expect(userFacingMessage("just a string")).toBeNull();
    expect(userFacingMessage(null)).toBeNull();
    expect(userFacingMessage(new UserError(""))).toBeNull();
  });
});
