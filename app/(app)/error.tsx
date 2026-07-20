"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surface for debugging; wire to a real logger/Sentry later.
    console.error(error);
  }, [error]);

  return (
    <div className="card">
      <div className="empty-state">
        <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Something went wrong</div>
        <div style={{ marginBottom: 16 }}>
          This screen hit an unexpected error. You can retry, or head back to the dashboard.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button className="btn primary" onClick={reset}>
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
