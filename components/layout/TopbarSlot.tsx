"use client";
import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The id of the centre region in Topbar. Exported so the two ends of this portal name the
 *  same string rather than repeating a literal. */
export const TOPBAR_SLOT_ID = "topbar-slot";

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
 * Renders nothing on the server and nothing during hydration, then portals once mounted.
 * The target lives in AppShell, an ancestor, so it is in the DOM by then.
 *
 * `useSyncExternalStore` rather than the usual useState-in-an-effect: that pattern sets
 * state synchronously inside an effect, which costs a second render pass on every mount and
 * is flagged by react-hooks/set-state-in-effect. A store whose snapshot is a constant gives
 * the same client/server split with no state and no extra pass — the subscribe callback is
 * empty because nothing here ever changes after mount.
 */
const neverChanges = () => () => {};

export function TopbarSlot({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(
    neverChanges,
    () => true,
    () => false,
  );
  if (!mounted) return null;
  // Guarded: pages outside AppShell (sign-in, set-password) have no topbar, and
  // createPortal throws on a null container rather than skipping.
  const node = document.getElementById(TOPBAR_SLOT_ID);
  return node ? createPortal(children, node) : null;
}
