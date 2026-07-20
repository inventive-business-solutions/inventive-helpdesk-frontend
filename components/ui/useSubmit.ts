"use client";
import { useRef, useState } from "react";
import { useToast } from "./Toast";

/**
 * Wraps an async mutation with a busy flag + success/error toasts, so write
 * actions can never silently "succeed" on a backend failure. Usage:
 *   const { busy, run } = useSubmit();
 *   run(() => store.addMember(...), { success: "Member added", onSuccess: onClose });
 */
export function useSubmit() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  // Ref guard: blocks a synchronous double-invoke (rapid double-click fires two
  // events before React re-renders, so a state-only `busy` check can let both in).
  const inFlight = useRef(false);

  async function run(
    action: () => Promise<unknown>,
    opts?: { success?: string; error?: string; onSuccess?: () => void },
  ) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      await action();
      if (opts?.success) toast(opts.success);
      opts?.onSuccess?.();
    } catch (e) {
      console.error(e);
      toast(opts?.error ?? "Something went wrong — please try again.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return { busy, run };
}
