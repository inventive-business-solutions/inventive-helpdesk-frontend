/**
 * Frappe Socket.IO client for live ticket updates.
 *
 * Connects SAME-ORIGIN through the Next proxy (`/socket.io` → Frappe's socketio port,
 * see next.config.mjs), so the session cookie authenticates the handshake with no CORS
 * or cross-site-cookie problems. Transport starts on polling and upgrades to WebSocket
 * when the deployment allows it; either way updates arrive in ~1s.
 *
 * Two server events (see inventive_helpdesk_backend/realtime.py):
 *   - `ticket_update`      → the DOC room `doc:Support Ticket/<name>` (permission-gated
 *                            by Frappe's can_subscribe_doc → our ticket_has_permission).
 *                            Carries the name; the open detail view re-fetches that ticket.
 *   - `ticket_list_dirty`  → the DOCTYPE room `doctype:Support Ticket` (contentless ping);
 *                            open list/board views refetch their own scoped set.
 *
 * The 30s auto-refresh poller stays as a fallback, so a dropped socket never means stale
 * data — realtime just collapses the latency when connected.
 */
import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

/** Connect once (idempotent). No-op during SSR. */
function ensureSocket(): Socket | null {
  if (typeof window === "undefined") return null;
  if (socket) return socket;
  socket = io("/", {
    path: "/socket.io",
    withCredentials: true,
    // Reconnect quietly forever; the poller covers any gap while we're down.
    reconnectionAttempts: Infinity,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 15000,
    autoConnect: true,
  });
  return socket;
}

/** Fully tear down the connection (on sign-out). */
export function stopRealtime() {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/** Join the doctype room for contentless "the list changed" pings. Re-joins on every
 *  (re)connect, since socket rooms reset when the connection drops. Returns a cleanup. */
export function subscribeDoctype(doctype: string): () => void {
  const s = ensureSocket();
  if (!s) return () => {};
  const join = () => s.emit("doctype_subscribe", doctype);
  s.on("connect", join);
  if (s.connected) join();
  return () => {
    s.off("connect", join);
    if (s.connected) s.emit("doctype_unsubscribe", doctype);
  };
}

/** Join one ticket's doc room (server permission-checks the subscribe). Returns a cleanup. */
export function subscribeDoc(doctype: string, docname: string): () => void {
  const s = ensureSocket();
  if (!s) return () => {};
  const join = () => s.emit("doc_subscribe", doctype, docname);
  s.on("connect", join);
  if (s.connected) join();
  return () => {
    s.off("connect", join);
    if (s.connected) s.emit("doc_unsubscribe", doctype, docname);
  };
}

/** Listen for a realtime event; returns an unsubscribe fn. */
export function onRealtime<T = unknown>(event: string, cb: (data: T) => void): () => void {
  const s = ensureSocket();
  if (!s) return () => {};
  s.on(event, cb as (data: unknown) => void);
  return () => s.off(event, cb as (data: unknown) => void);
}
