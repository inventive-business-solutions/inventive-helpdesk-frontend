"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render a section's own control into the topbar's centre.
 *
 * A portal rather than props threaded through AppShell: the topbar is rendered once, above
 * the router, while the thing going into it belongs to whichever page is mounted and owns
 * its state. Lifting that state up would make every list's search live in a store so the
 * header could read it, which is a lot of machinery to move one box.
 *
 * The position is global; what sits in it is NOT. Each page portals its own search, which
 * filters that page and nothing else — the placeholder names the section for exactly this
 * reason, since a centred box in a header otherwise reads as a global search, which is
 * what this app deliberately does not have.
 *
 * ## Why the target is registered rather than looked up
 *
 * This used to read `document.getElementById` during render, once, and render nothing if it
 * came back null — with a comment asserting the topbar "is in the DOM by then". That is true
 * only if the topbar commits first, and nothing guarantees the order: the shell gates on
 * session boot, so a page's search can mount in a pass where the topbar has not. When it
 * lost that race the lookup returned null and NOTHING EVER ASKED AGAIN, because a plain DOM
 * read gives React nothing to re-render on. The search box simply never appeared, and which
 * way it fell varied per page load — reported as a search bar that comes and goes on reload.
 *
 * Registering inverts it. The topbar hands its node over via a ref callback, which React
 * runs at commit in both directions, and this subscribes. Mount in either order and the
 * portal still lands: if the slot arrives second, the subscription re-renders this.
 *
 * It also stops reading the DOM during render, which was impure — a render React discarded
 * (concurrent, StrictMode) would still have queried live document state.
 */

let slot: HTMLElement | null = null;
const listeners = new Set<() => void>();

/** Ref callback for the topbar's centre region. React calls it with the element on mount and
 *  with null on unmount, so registration and teardown need no effect of their own. */
export function registerTopbarSlot(node: HTMLElement | null) {
  slot = node;
  // A ref callback must not return a value — React 19 treats a returned function as the
  // cleanup. `forEach` returns undefined and the braces swallow it, which is what we want.
  listeners.forEach((l) => l());
}

export function subscribeTopbarSlot(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/** The registered node, or null. Exported alongside `subscribeTopbarSlot` because the two
 *  are one contract, and because a registry is only testable if its state is readable. */
export function getTopbarSlot() {
  return slot;
}

/** Null on the server and through hydration, so the markup matches; the subscription then
 *  supplies the real node once the topbar commits. */
const noSlot = () => null;

export function TopbarSlot({ children }: { children: ReactNode }) {
  const node = useSyncExternalStore(subscribeTopbarSlot, getTopbarSlot, noSlot);
  // Still guarded: pages outside AppShell (sign-in, set-password) have no topbar at all, and
  // createPortal throws on a null container rather than skipping.
  return node ? createPortal(children, node) : null;
}
