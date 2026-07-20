"use client";

// Catches errors thrown in the root layout itself (fonts, providers). It must
// render its own <html>/<body> because it replaces the root layout.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  if (typeof console !== "undefined") console.error(error);
  return (
    <html lang="en">
      <body
        style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f6fb", color: "#16181f" }}
      >
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ opacity: 0.7, fontSize: 14, marginBottom: 20 }}>
              An unexpected error occurred. Try again, or reload the page.
            </p>
            <button
              onClick={() => reset()}
              style={{
                padding: "9px 18px",
                borderRadius: 8,
                border: "none",
                background: "#4b53d6",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
