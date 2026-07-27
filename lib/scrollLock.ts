/** Ref-counted body scroll lock, shared by every dialog that stacks.
 *
 *  Each dialog saving and restoring `document.body.style.overflow` itself only works while
 *  exactly one is open. Stack two — a Modal with the "Discard changes?" alert over it — and
 *  the inner one captures "hidden" as the value to put back, because the outer one had
 *  already set it. React runs cleanups parent-first when it deletes a subtree, so on the
 *  commit that closes both (pressing Discard unmounts the alert AND the Modal together)
 *  the Modal restores "" and then the alert re-applies "hidden". The lock outlives the last
 *  dialog and the page cannot be scrolled again until it is reloaded.
 *
 *  A counter removes the ordering question entirely: the original value is read once, when
 *  the first lock is taken, and written back once, when the last is released. Who unmounts
 *  first stops mattering.
 */
let depth = 0;
let saved = "";

/** Lock body scroll. Returns the release — call it exactly once, from effect cleanup. */
export function lockBodyScroll(): () => void {
  if (depth === 0) {
    saved = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  depth++;
  // Guarded so a double-invoked cleanup (React StrictMode remounts effects in development)
  // cannot decrement twice and free the lock while a dialog is still on screen.
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) document.body.style.overflow = saved;
  };
}
