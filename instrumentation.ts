/**
 * Server-side error reporting for the Next process.
 *
 * Next calls `register()` once per server runtime at startup, and `onRequestError` for
 * every unhandled error in a route handler, server component or middleware.
 *
 * The BACKEND is instrumented separately and does not go through here: frappe initialises
 * its own Sentry SDK from FRAPPE_SENTRY_DSN (see deploy/docker-compose.yml in the backend
 * repo). This covers the Next tier only — the proxy, the health route and SSR.
 *
 * Unset DSN is the normal state for local development and for any deploy that has not
 * configured Sentry. Nothing initialises and nothing is sent; it is not an error.
 */
import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function register() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    // Errors only. Tracing on a single Swarm node buys little and costs a span on every
    // request; turn it up deliberately if someone is actually going to read it.
    tracesSampleRate: 0,
    // This is a support desk: an event body can otherwise carry ticket text, client
    // contact details and session identifiers belonging to a tenant. `sendDefaultPii`
    // defaults to false, but it is stated rather than assumed — the cost of it silently
    // flipping is customer data in a third-party service.
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
    // Ties an event to the image it came from. Same value the /api/health route reports,
    // so a report can be matched to a deploy without guessing.
    release: process.env.BUILD_SHA || undefined,
  });
}

// Safe to export unconditionally: with no init above, capture is a no-op.
export const onRequestError = Sentry.captureRequestError;
