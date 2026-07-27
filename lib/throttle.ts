/**
 * Leading-and-trailing throttle.
 *
 * Built for realtime pings, where the two failure modes pull in opposite directions:
 *
 *   - A plain debounce delays EVERY event by the full window, so one ticket arriving on a
 *     quiet system takes a second to show. That is the common case and it should be
 *     instant.
 *   - No throttle at all means a burst of fifty events triggers fifty full list refetches
 *     in every open tab. That is the surge case and it is what takes a system down.
 *
 * So: fire immediately on the first call, then swallow everything for `ms`, and if
 * anything arrived during that window fire once more at the end. One event costs one call
 * with no delay; fifty events in a second cost two.
 */
export interface Throttled {
  (): void;
  /** Drop any pending trailing call. Call on unmount so a fired timer cannot run against
   *  a torn-down component. */
  cancel: () => void;
}

export function throttleTrailing(fn: () => void, ms: number): Throttled {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = false;

  const openWindow = () => {
    timer = setTimeout(() => {
      timer = null;
      if (!pending) return;
      pending = false;
      fn();
      // Something fired, so open a fresh window — a continuous stream must not collapse
      // into a tight loop of trailing calls.
      openWindow();
    }, ms);
  };

  const throttled = (() => {
    if (timer) {
      pending = true;
      return;
    }
    fn();
    openWindow();
  }) as Throttled;

  throttled.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pending = false;
  };
  return throttled;
}
