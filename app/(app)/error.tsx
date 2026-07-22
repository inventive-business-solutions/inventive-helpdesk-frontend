"use client";
import { startTransition, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    // Surface for debugging; wire to a real logger/Sentry later.
    console.error(error);
  }, [error]);

  // `reset()` alone only clears the boundary's own state; it does not re-fetch the
  // segment, so anything that failed server-side re-throws immediately and the user sees
  // the same screen. Refreshing first is what actually retries. Next 16.2 exposes this as
  // the `unstable_retry` prop, whose implementation is exactly the two calls below
  // (next/dist/client/components/error-boundary.js) — done here with stable APIs so no
  // unstable prop ends up on a production path.
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="card">
      <div className="empty-state">
        <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Something went wrong</div>
        <div style={{ marginBottom: 16 }}>
          This screen hit an unexpected error. You can retry, or head back to the dashboard.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="btn primary" onClick={retry}>
            Try again
          </button>
          {/* Hard navigation (full reload) is intentional in an error boundary: it clears
              the broken client state that tripped the error. eslint-disable-next-line below. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a className="btn" href="/">
            Back to dashboard
          </a>
        </div>
      </div>
    </div>
  );
}
