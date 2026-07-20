import type { Role } from "@/types";

/**
 * The safe destination to land on after authenticating. Honors an in-app `?next`
 * deep-link (set by the middleware auth gate or a session-expiry bounce), guarded
 * against open redirects — it must be a single-slash internal path — otherwise falls
 * back to the role's home. Shared by the sign-in and set-password flows so both behave
 * identically.
 */
export function postAuthDest(role: Role): string {
  const home = role === "admin" ? "/" : "/portal";
  if (typeof window === "undefined") return home;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : home;
}
