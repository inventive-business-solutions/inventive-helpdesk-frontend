"use client";
import { useEffect, useRef } from "react";

/** Default cadence for background ticket refresh. */
export const TICKET_POLL_MS = 30_000;

/**
 * Poll `fn` on an interval, but ONLY while the tab is visible — hidden/background tabs
 * make zero requests. Refetches immediately on tab focus / becoming visible (so returning
 * shows fresh data at once), and skips a tick while the previous run is still in flight
 * (no pile-ups). Background errors are swallowed and simply retried on the next tick.
 *
 * The latest `fn` closure is always called without resetting the timer, so passing an
 * inline arrow each render is fine.
 */
export function useAutoRefresh(fn: () => Promise<void> | void, intervalMs = TICKET_POLL_MS, enabled = true) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (running.current || document.visibilityState !== "visible") return;
      running.current = true;
      try {
        await fnRef.current();
      } catch {
        /* background refresh — swallow and retry next tick */
      } finally {
        running.current = false;
      }
    };
    const start = () => {
      if (!timer) timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    // Returning to the tab (or refocusing the window) refetches at once, then resumes.
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void tick();
        start();
      } else {
        stop();
      }
    };
    const onFocus = () => void tick();

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    if (document.visibilityState === "visible") start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, intervalMs]);
}
