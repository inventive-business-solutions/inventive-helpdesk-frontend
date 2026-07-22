"use client";
import { useEffect } from "react";

// Catches errors thrown in the root layout itself (fonts, providers). It must
// render its own <html>/<body> because it replaces the root layout.
//
// `reset` is deliberately unused: the failure is in the root layout, so clearing the
// boundary re-runs the same broken render and lands the user right back here. A full
// reload is the only retry that can actually succeed, and it also discards whatever
// client state contributed to the failure.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  // In an effect, not the render body: a bare console.error here is a render-phase side
  // effect that fires on every render, and twice under reactStrictMode.
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f6fb", color: "#16181f" }}
      >
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20 }}>
              An unexpected error occurred. Reloading the page usually clears it.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "none",
                background: "#4b53d6",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
