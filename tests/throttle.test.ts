/**
 * The burst guard on realtime list pings.
 *
 * `ticket_list_dirty` is a broadcast: every connected session refetches its whole ticket
 * list on receipt. Unthrottled, fifty tickets arriving from an email burst meant fifty full
 * refetches in every open tab simultaneously — load rising with both the surge and the
 * number of people watching it, which is the shape of an outage rather than a slowdown.
 *
 * Both edges of the behaviour matter and pull against each other, so both are pinned: one
 * event must NOT be delayed (that is the ordinary case), and fifty must NOT cost fifty.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { throttleTrailing } from "../lib/throttle";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("throttleTrailing", () => {
  it("fires the first call immediately — a lone ticket must not wait for the window", () => {
    const fn = vi.fn();
    throttleTrailing(fn, 1000)();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("collapses a burst into two calls: one now, one at the end of the window", () => {
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1000);
    for (let i = 0; i < 50; i++) t();
    expect(fn).toHaveBeenCalledTimes(1); // leading only, so far
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2); // trailing catch-up
  });

  it("does not fire a trailing call when nothing arrived during the window", () => {
    const fn = vi.fn();
    throttleTrailing(fn, 1000)();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  // A steady stream must settle into one call per window, not a tight loop of trailing
  // calls chasing each other.
  it("settles to one call per window under a continuous stream", () => {
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1000);
    for (let tick = 0; tick < 5000; tick += 100) {
      t();
      vi.advanceTimersByTime(100);
    }
    // 5s of constant events at a 1s window: the leading call plus ~5 trailing ones.
    expect(fn.mock.calls.length).toBeGreaterThanOrEqual(4);
    expect(fn.mock.calls.length).toBeLessThanOrEqual(7);
  });

  it("fires immediately again once the window has fully drained", () => {
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1000);
    t();
    vi.advanceTimersByTime(1500); // window closes with nothing pending
    t();
    expect(fn).toHaveBeenCalledTimes(2); // second call is leading-edge again, no delay
  });

  it("cancel() drops a pending trailing call, so an unmounted view never refetches", () => {
    const fn = vi.fn();
    const t = throttleTrailing(fn, 1000);
    t();
    t(); // queues a trailing call
    t.cancel();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
