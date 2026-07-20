/** @type {import('next').NextConfig} */

// The frontend never talks to Frappe cross-origin. It calls same-origin
// `/api/frappe/*` on the Next server, which proxies to the Frappe backend
// (below), so session cookies "just work" in dev and prod, with no CORS dance.
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
  // Realtime (Socket.IO) — same-origin so the session cookie rides the handshake. The
  // polling transport works through this HTTP rewrite; a WebSocket upgrade works where the
  // serving layer supports it (nginx in prod), otherwise it stays on polling.
  { source: "/socket.io/:path*", destination: `${SOCKETIO_URL}/socket.io/:path*` },
  { source: "/frappe-files/:path*", destination: `${FRAPPE_URL}/files/:path*` },
  // Private ticket attachments. Frappe permission-gates /private/files/* by the file's
  // attached Support Ticket, so tenant isolation applies — a client can only fetch files
  // on their own tickets. Session cookie rides along same-origin through the proxy.
  { source: "/api/frappe/private-files/:path*", destination: `${FRAPPE_URL}/private/files/:path*` },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return proxyRewrites;
  },
};

export default (phase) => {
  // Fail fast at runtime (`next start`) if the backend URL is missing — never
  // silently proxy to localhost in production. Not enforced during build/lint,
  // which don't touch the backend.
  if (phase === "phase-production-server" && !process.env.FRAPPE_URL) {
    throw new Error("FRAPPE_URL must be set in production — see .env.example.");
  }
  return nextConfig;
};
