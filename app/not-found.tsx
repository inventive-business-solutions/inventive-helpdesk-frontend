import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em" }}>404</div>
        <p style={{ color: "var(--muted)", margin: "8px 0 20px" }}>We couldn&apos;t find that page.</p>
        <Link href="/" className="btn primary" style={{ textDecoration: "none" }}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
