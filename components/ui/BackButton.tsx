"use client";
import { useRouter } from "next/navigation";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";

/** Read `?from=` at click time from the live URL.
 *
 *  Deliberately not `useSearchParams()`: that hook opts the whole page into a Suspense
 *  boundary at build time, and this control is now on six pages that do not otherwise read
 *  the query string. Nothing here needs to re-render when the param changes — it is only
 *  consulted when the button is pressed — so reading `location` then is both sufficient
 *  and free of that constraint.
 *
 *  Only same-origin paths are honoured. A bare "/" prefix check is not enough: "//evil.com"
 *  also starts with a slash and is a protocol-relative URL that would navigate off-site. */
export function originFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const from = new URLSearchParams(window.location.search).get("from");
  if (!from || !from.startsWith("/") || from.startsWith("//")) return null;
  return from;
}

/**
 * Back, to a known destination.
 *
 * NOT `router.back()`. Mirroring browser history makes two pages ping-pong: arrive at
 * Clients from Tickets, press Back to reach Tickets, and Tickets' own Back returns to
 * Clients — for as long as anyone keeps pressing. A control that lands somewhere different
 * each time you press it, depending on how you arrived, is not navigation.
 *
 * So the destination is always stated, never inferred:
 *   1. `?from=` on the URL — set by links that carry context into a page, such as
 *      "Show tickets" on a client's product, which opens the Tickets page filtered to that
 *      client. That is the "original source" and the only thing that knows it.
 *   2. Otherwise the page's own fallback — its section parent, Dashboard by default.
 *
 * Both are fixed points: pressing Back twice from the same page goes the same place twice.
 */
export function BackButton({ fallback = "/" }: { fallback?: string }) {
  const router = useRouter();
  return (
    <IconButton
      className="page-back"
      icon={<Icon name="arrowLeft" size={17} />}
      label="Go back"
      onClick={() => router.push(originFromUrl() ?? fallback)}
    />
  );
}

/** Append the current location as `from`, so the destination's Back returns here.
 *
 *  Used by links that navigate into a filtered view of ANOTHER section — the destination
 *  cannot work out where it was opened from, and its sidebar entry points at the unfiltered
 *  list, so without this the way back is gone. */
export function withOrigin(href: string, from: string): string {
  return `${href}${href.includes("?") ? "&" : "?"}from=${encodeURIComponent(from)}`;
}
