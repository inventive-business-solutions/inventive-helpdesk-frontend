"use client";
import { useEffect, useEffectEvent, useRef } from "react";

/** Default cadence for background ticket refresh. */
export const TICKET_POLL_MS = 30_000;

/** Window for collapsing `ticket_list_dirty` broadcasts. Long enough that an email burst
 *  or a busy triage minute costs two refetches rather than fifty; short enough that a
 *  second ticket arriving right behind the first is still on screen well inside the "few
 *  seconds" a person would call live. */
export const LIST_PING_THROTTLE_MS = 1_500;

/**
 * Poll interval to use while realtime is NOT connected.
 *
 * The socket normally carries updates in about a second, and 30s is a cheap safety net
 * behind it. But every way realtime can fail degrades silently to that 30s — which is how
 * a ticket raised by a client sat unseen on an agent's dashboard until they refreshed by
 * hand, with nothing on screen to say the live channel was down.
 *
 * So the fallback is no longer a fixed 30s: when the socket is down, this is the interval,
 * and it bounds staleness at five seconds however realtime is failing. It costs more
 * requests, which is the correct trade when the alternative is data that is quietly half a
 * minute old.
 */
export const DEGRADED_POLL_MS = 5_000;

/** The interval a list should poll at, given whether realtime is currently delivering. */
export const listPollInterval = (realtimeConnected: boolean) =>
  realtimeConnected ? TICKET_POLL_MS : DEGRADED_POLL_MS;

/**
 * Poll `fn` on an interval, but ONLY while the tab is visible — hidden/background tabs
 * make zero requests. Refetches immediately on tab focus / becoming visible (so returning
 * shows fresh data at once), and skips a tick while the previous run is still in flight
 * (no pile-ups). Background errors are swallowed and simply retried on the next tick.
 *
 * The latest `fn` closure is always called without resetting the timer, so passing an
 * inline arrow each render is fine. That freshness comes from `useEffectEvent` (stable in
 * React 19.2) rather than the older assign-a-ref-during-render idiom: writing a ref in the
 * render body is a rules-of-React violation, because a render that React discards can
 * still leave the ref pointing at a closure that never committed — and the interval would
 * then call it.
 */
export function useAutoRefresh(fn: () => Promise<void> | void, intervalMs = TICKET_POLL_MS, enabled = true) {
  const runLatest = useEffectEvent(() => fn());
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      if (running.current || document.visibilityState !== "visible") return;
      running.current = true;
      try {
        await runLatest();
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
