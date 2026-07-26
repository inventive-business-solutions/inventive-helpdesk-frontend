/**
 * Browser error reporting.
 *
 * This is the tier that previously reported to nobody. A failed save, a render crash or a
 * TypeError in a modal surfaced as "Something went wrong" to the agent and left no trace
 * anywhere — the store deliberately swallows background-refresh errors, and useAutoRefresh
 * swallows its own by design, so the only signal was a user mentioning it.
 *
 * Next loads this file on the client before hydration (15.3+). An unset DSN initialises
 * nothing, which is the normal state locally.
 */
import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0,
    // See instrumentation.ts. Especially load-bearing on the client, where a breadcrumb
    // trail would otherwise record the contents of whatever ticket the agent had open.
    sendDefaultPii: false,
    environment: process.env.NODE_ENV,
    release: process.env.BUILD_SHA || undefined,
    // Session Replay is deliberately NOT enabled. It records the DOM, which here means
    // recording client ticket contents and contact details into a third-party service —
    // a tenant-isolation question, not a preference. Turning it on is a decision for
    // whoever owns the customer data agreement, not a default.
  });
}

// Reports errors thrown during App Router client-side navigations, which are otherwise
// invisible to the error boundaries in app/(app)/error.tsx.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
