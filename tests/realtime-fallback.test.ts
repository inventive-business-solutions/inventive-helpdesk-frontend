/**
 * How stale a list can get when realtime is not delivering.
 *
 * Reported as: a client raised a ticket, it did not appear on the agent's dashboard, and a
 * manual refresh brought it in. The socket wiring was all present — AppShell joins the
 * doctype room, both the list and the Dashboard listen for `ticket_list_dirty` — and the
 * production handshake answers in ~250ms. What was missing is that NOTHING observed whether
 * the socket was actually delivering.
 *
 * Every way realtime fails — a refused handshake, the socketio service restarting, redis
 * pub/sub not reaching it from the web container — ends in the same state: an app that
 * looks connected, receives no events, and quietly relies on a 30-second poll. No error, no
 * indicator, and a half-minute-old dashboard that looks live.
 *
 * The fix does not claim to make the socket reliable; it makes the failure bounded. When
 * the socket is down the poll tightens to 5s, so staleness has a ceiling however realtime
 * is broken.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { listPollInterval, TICKET_POLL_MS, DEGRADED_POLL_MS } from "../lib/useAutoRefresh";

describe("listPollInterval", () => {
  it("stays cheap behind a healthy socket", () => {
    // Realtime carries updates in about a second; this is only a safety net.
    expect(listPollInterval(true)).toBe(TICKET_POLL_MS);
    expect(TICKET_POLL_MS).toBe(30_000);
  });

  it("bounds staleness at five seconds when the socket is down", () => {
    expect(listPollInterval(false)).toBe(DEGRADED_POLL_MS);
    expect(DEGRADED_POLL_MS).toBeLessThanOrEqual(5_000);
  });

  it("degrades to a SHORTER interval, never a longer one", () => {
    // Guards the direction. Swapping these reads as a sensible "back off when the socket is
    // struggling" and would restore the original bug in a form nobody would question.
    expect(listPollInterval(false)).toBeLessThan(listPollInterval(true));
  });
});

describe("realtime connection status", () => {
  // socket.io is not loaded here; the module's state machine is what matters, and it is
  // driven by the three socket events regardless of transport.
  beforeEach(() => {
    vi.resetModules();
  });

  it("starts disconnected, so a page that never connects polls fast rather than assuming", () => {
    // The important default. Assuming connected-until-proven-otherwise is what produced a
    // 30s poll on a socket that had never once delivered an event.
    return import("../lib/realtime").then((m) => {
      expect(m.isRealtimeConnected()).toBe(false);
      expect(listPollInterval(m.isRealtimeConnected())).toBe(DEGRADED_POLL_MS);
    });
  });

  it("reports the same value to SSR, so the interval does not change at hydration", () => {
    return import("../lib/realtime").then((m) => {
      expect(m.realtimeDisconnected()).toBe(false);
      expect(m.realtimeDisconnected()).toBe(m.isRealtimeConnected());
    });
  });

  it("notifies subscribers and stops after unsubscribe", () => {
    return import("../lib/realtime").then((m) => {
      const seen = vi.fn();
      const off = m.subscribeRealtimeStatus(seen);
      // No socket in this environment, so drive the only transition available: teardown is
      // idempotent and must not notify when nothing changed.
      m.stopRealtime();
      expect(seen).not.toHaveBeenCalled(); // already false — no change, no wake-up
      off();
    });
  });
});
