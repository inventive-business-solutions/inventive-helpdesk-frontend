/**
 * The topbar portal target, and the mount-order race that made the search bar come and go.
 *
 * The old version read `document.getElementById` during render, once. If a page's search
 * mounted in a pass where the topbar had not yet committed, the lookup returned null, the
 * component rendered nothing — and nothing ever asked again, because a plain DOM read gives
 * React no reason to re-render. Which way it fell varied per load: the search bar was there,
 * gone after a reload, back after the next one.
 *
 * Registration fixes it by making "the slot appeared" an event a subscriber can be woken by.
 * Both mount orders are pinned below, because only one of them was ever broken — and it is
 * the one that does NOT reproduce on a warm dev reload, which is why it survived.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { registerTopbarSlot, subscribeTopbarSlot, getTopbarSlot } from "../components/layout/TopbarSlot";

const node = () => ({ tagName: "DIV" }) as unknown as HTMLElement;

beforeEach(() => {
  registerTopbarSlot(null); // module-scoped registry; reset between tests
});

describe("topbar slot registry", () => {
  it("wakes a subscriber that mounted BEFORE the slot existed — the broken order", () => {
    const woken = vi.fn();
    const unsub = subscribeTopbarSlot(woken);

    // The page's search is mounted and there is no topbar yet. The old code rendered null
    // here and was finished; this one is still listening.
    expect(getTopbarSlot()).toBeNull();
    expect(woken).not.toHaveBeenCalled();

    const el = node();
    registerTopbarSlot(el); // the topbar commits

    expect(woken).toHaveBeenCalledTimes(1);
    expect(getTopbarSlot()).toBe(el); // …and the re-read finds the real target
    unsub();
  });

  it("serves a subscriber that mounts AFTER the slot, with no notification needed", () => {
    const el = node();
    registerTopbarSlot(el);

    const woken = vi.fn();
    const unsub = subscribeTopbarSlot(woken);

    // useSyncExternalStore reads the snapshot on first render, so this order never needed
    // an event. It is the order that always worked, kept here so a "fix" cannot break it.
    expect(getTopbarSlot()).toBe(el);
    expect(woken).not.toHaveBeenCalled();
    unsub();
  });

  it("clears on unmount, so nothing portals into a detached node", () => {
    registerTopbarSlot(node());
    expect(getTopbarSlot()).not.toBeNull();

    // React calls a ref with null when the element unmounts — signing out drops the shell.
    // Keeping the old node would portal the search into an element no longer in the page.
    registerTopbarSlot(null);
    expect(getTopbarSlot()).toBeNull();
  });

  it("notifies every subscriber, not just the most recent", () => {
    const a = vi.fn();
    const b = vi.fn();
    const ua = subscribeTopbarSlot(a);
    const ub = subscribeTopbarSlot(b);
    registerTopbarSlot(node());
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    ua();
    ub();
  });

  it("stops notifying after unsubscribe", () => {
    const woken = vi.fn();
    subscribeTopbarSlot(woken)();
    registerTopbarSlot(node());
    expect(woken).not.toHaveBeenCalled();
  });

  it("returns undefined from the ref callback — React 19 reads a return value as cleanup", () => {
    // If this returned anything (the result of forEach, say), React would call it on unmount
    // as a cleanup function and throw.
    expect(registerTopbarSlot(node())).toBeUndefined();
  });
});
