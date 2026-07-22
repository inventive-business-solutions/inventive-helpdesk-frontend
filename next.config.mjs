/** @type {import('next').NextConfig} */

// The frontend never talks to Frappe cross-origin. It calls same-origin
// `/api/frappe/*` on the Next server, which proxies to the Frappe backend
// (below), so session cookies "just work" in dev and prod, with no CORS dance.
//
// BUILD-TIME, NOT RUNTIME. `rewrites()` is evaluated by `next build` and frozen into
// .next/routes-manifest.json; the production server reads that manifest and never
// re-runs this file. So FRAPPE_URL/SOCKETIO_URL must be set when the image is BUILT —
// setting them only in the container is silently ignored, and every proxied call fails
// with EAI_AGAIN against whatever was baked in. The Dockerfile takes both as required
// build args for exactly this reason; see CICD.md.
const FRAPPE_URL = process.env.FRAPPE_URL || "http://127.0.0.1:8000";
// Frappe's Socket.IO runs on its own port (socketio_port, 9000 in dev). Proxying it
// same-origin lets the session cookie authenticate the realtime handshake. In prod this
// points at the same host nginx serves /socket.io from.
const SOCKETIO_URL = process.env.SOCKETIO_URL || "http://127.0.0.1:9000";
const isProd = process.env.NODE_ENV === "production";

// Content-Security-Policy locks the app to same-origin. 'unsafe-inline' is
// required for Next's hydration payload / styled-jsx without per-request nonces;
// script-injection risk is otherwise low (React escapes output, no
// dangerouslySetInnerHTML anywhere). Dev additionally needs eval + the HMR socket.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'" + (isProd ? "" : " 'unsafe-eval'"),
  "connect-src 'self'" + (isProd ? "" : " ws: wss:"),
].join("; ");

// Baseline security headers for an authenticated internal tool.
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

// Allowlist proxy: only the specific Frappe endpoints the app uses are forwarded.
// Everything else under /api/frappe/* falls through to a 404 instead of exposing
// Frappe's whole method surface (frappe.client.*, etc.). Tenant isolation on the
// /resource/* endpoints is still enforced by Frappe's own permission model.
const proxyRewrites = [
  { source: "/api/frappe/method/login", destination: `${FRAPPE_URL}/api/method/login` },
  { source: "/api/frappe/method/logout", destination: `${FRAPPE_URL}/api/method/logout` },
  {
    source: "/api/frappe/method/frappe.auth.get_logged_user",
    destination: `${FRAPPE_URL}/api/method/frappe.auth.get_logged_user`,
  },
  {
    source: "/api/frappe/method/frappe.core.doctype.user.user.reset_password",
    destination: `${FRAPPE_URL}/api/method/frappe.core.doctype.user.user.reset_password`,
  },
  {
    source: "/api/frappe/method/frappe.core.doctype.user.user.update_password",
    destination: `${FRAPPE_URL}/api/method/frappe.core.doctype.user.user.update_password`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.me",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.me`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.add_message",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.add_message`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.add_note",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.add_note`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.reopen",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.reopen`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.claim_ticket",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.claim_ticket`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.add_collaborator",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.add_collaborator`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.remove_collaborator",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.remove_collaborator`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.upload_attachment",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.upload_attachment`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.unread_tickets",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.unread_tickets`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.mark_ticket_read",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.mark_ticket_read`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.email.send_test_email",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.email.send_test_email`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.update_member",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.update_member`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.update_client",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.update_client`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.update_product",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.update_product`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.update_poc",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.update_poc`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.delete_poc",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.delete_poc`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.invite_poc",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.invite_poc`,
  },
  {
    source: "/api/frappe/method/inventive_helpdesk_backend.api.invite_member",
    destination: `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.api.invite_member`,
  },
  { source: "/api/frappe/resource/:path*", destination: `${FRAPPE_URL}/api/resource/:path*` },
  // Realtime (Socket.IO) — same-origin so the session cookie rides the handshake. A Next
  // rewrite does not proxy the HTTP Upgrade handshake, so the transport stays on polling;
  // the server advertises a websocket upgrade, the client tries it, and it quietly fails
  // back. Fine in practice — updates still land in about a second.
  //
  // The exact-match rule must come first and is not redundant. Every Engine.IO request is
  // `/socket.io/?EIO=4&...` — trailing slash, no path segments — but Next normalises the
  // pathname to `/socket.io` before matching, and the `:path*` pattern below then renders
  // an empty segment as nothing, proxying to `/socket.io?EIO=4&...`. Frappe's socket.io
  // server does not answer that path: it resets the connection, so every handshake fails
  // while the app quietly falls back to the 30s poller — slow updates, never an error.
  // Since the slash cannot survive into the matcher, the destination restores it. This
  // source matches `/socket.io` and `/socket.io/` alike, so it wins either way.
  { source: "/socket.io", destination: `${SOCKETIO_URL}/socket.io/` },
  { source: "/socket.io/:path*", destination: `${SOCKETIO_URL}/socket.io/:path*` },
  { source: "/frappe-files/:path*", destination: `${FRAPPE_URL}/files/:path*` },
  // Private ticket attachments. Frappe permission-gates /private/files/* by the file's
  // attached Support Ticket, so tenant isolation applies — a client can only fetch files
  // on their own tickets. Session cookie rides along same-origin through the proxy.
  { source: "/api/frappe/private-files/:path*", destination: `${FRAPPE_URL}/private/files/:path*` },
];

const nextConfig = {
  reactStrictMode: true,
  // Drop `X-Powered-By: Next.js`. Only fingerprinting value — it tells a scanner which
  // framework (and so which CVE set) to try, and buys nothing in return.
  poweredByHeader: false,
  // socket.io-client requests `/socket.io/?EIO=4...` with a trailing slash, which Next
  // otherwise answers with a 308 to the slashless form. Long-polling would still work —
  // XHR follows the redirect — but at two requests per poll, forever. This drops the
  // redirect so each poll is one request. It does NOT preserve the slash for rewrite
  // matching (Next normalises the pathname regardless); the socket.io rewrite below
  // restores it in the destination. Pages are unaffected: Next still serves `/tickets`
  // and `/tickets/` identically, it just no longer canonicalises between them.
  skipTrailingSlashRedirect: true,
  // Emit .next/standalone — a self-contained server bundling only the traced
  // dependencies, so the runtime image needs no node_modules. See Dockerfile.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return proxyRewrites;
  },
};

export default (phase) => {
  // Warn loudly when a production build bakes in the localhost defaults. Such a build
  // starts fine and serves pages, then fails on every backend call — so surface it here,
  // at the only point where it is still fixable. This is a warning rather than a throw
  // because a local `npm run build` smoke test legitimately has no backend configured;
  // the hard failure lives in the Dockerfile, where a defaulted URL is always a bug.
  if (phase === "phase-production-build" && !process.env.FRAPPE_URL) {
    console.warn(
      "\n[next.config] FRAPPE_URL is not set — baking the localhost default into this build." +
        "\n[next.config] Proxy destinations are frozen at build time, so this build cannot" +
        "\n[next.config] talk to a real backend. Fine locally; broken if deployed.\n",
    );
  }
  return nextConfig;
};
