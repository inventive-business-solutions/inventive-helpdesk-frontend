/**
 * The body scroll lock, and specifically what happens when two dialogs stack.
 *
 * The bug this pins: Modal and AlertDialog each saved `document.body.style.overflow` on
 * mount and wrote it back on unmount. That is correct for one dialog and wrong for two.
 * Open a Modal (saves "", sets "hidden"), raise the "Discard changes?" alert over it (saves
 * "hidden", sets "hidden"), then press Discard — which unmounts both in the same commit.
 * React runs cleanups parent-first when deleting a subtree, so the Modal put back "" and
 * the alert then put back "hidden". The lock survived the last dialog and the page could
 * not be scrolled again until it was reloaded.
 *
 * Reported as "I can't scroll the ticket page" — with no dialog on screen to explain it.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { lockBodyScroll } from "../lib/scrollLock";

/** Minimal stand-in for the only thing the lock touches. */
const style = { overflow: "" };
// @ts-expect-error — jsdom is not configured for this suite; the lock reads exactly this.
globalThis.document = { body: { style } };

beforeEach(() => {
  style.overflow = "";
});

describe("lockBodyScroll", () => {
  it("locks on the first acquire and restores on the last release", () => {
    const unlock = lockBodyScroll();
    expect(style.overflow).toBe("hidden");
    unlock();
    expect(style.overflow).toBe("");
  });

  it("stays locked while a second dialog is open", () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    inner();
    expect(style.overflow).toBe("hidden"); // the Modal is still up
    outer();
    expect(style.overflow).toBe("");
  });

  it("restores when the outer dialog is released FIRST — the parent-first unmount", () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    // The order React actually uses when both are deleted in one commit.
    outer();
    inner();
    expect(style.overflow).toBe("");
  });

  it("keeps whatever the page had set, rather than assuming empty", () => {
    style.overflow = "auto";
    const unlock = lockBodyScroll();
    expect(style.overflow).toBe("hidden");
    unlock();
    expect(style.overflow).toBe("auto");
  });

  it("ignores a repeated release, so a double-invoked cleanup cannot free it early", () => {
    const outer = lockBodyScroll();
    const inner = lockBodyScroll();
    inner();
    inner();
    inner();
    expect(style.overflow).toBe("hidden"); // outer still holds it
    outer();
    expect(style.overflow).toBe("");
  });
});
