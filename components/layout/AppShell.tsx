"use client";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/store";
import { useAutoRefresh, TICKET_POLL_MS } from "@/lib/useAutoRefresh";
import { onRealtime, subscribeDoctype, stopRealtime } from "@/lib/realtime";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PortalShell } from "./PortalShell";

export function AppShell({ children }: { children: ReactNode }) {
  const session = useStore((s) => s.session);
  const booted = useStore((s) => s.booted);
  const restore = useStore((s) => s.restore);
  const refreshTickets = useStore((s) => s.refreshTickets);
  const pathname = usePathname();
  const router = useRouter();
  // Sidebar visibility, toggled by the topbar hamburger at every screen size.
  // Defaults open (desktop); collapsed on small screens after mount (see below).
  const [navOpen, setNavOpen] = useState(true);

  // Keep the ticket list fresh on its own while signed in — polls only when the tab is
  // visible, and covers both the staff app and the client portal (this is their shell).
  useAutoRefresh(refreshTickets, TICKET_POLL_MS, booted && !!session);

  // Live updates: once signed in, join the Support Ticket doctype room and refetch the
  // (permission-scoped) list on any "list changed" ping — collapsing the ~30s poll gap to
  // ~1s. The poller above stays as the fallback if the socket is down. On sign-out, tear
  // the socket down so the next user connects fresh.
  useEffect(() => {
    if (!booted || !session) return;
    const leave = subscribeDoctype("Support Ticket");
    const off = onRealtime("ticket_list_dirty", () => refreshTickets());
    return () => {
      off();
      leave();
    };
  }, [booted, session, refreshTickets]);
  useEffect(() => () => stopRealtime(), []);

  // On first mount, re-derive the session from the Frappe cookie (survives reloads).
  useEffect(() => {
    if (!useStore.getState().booted) restore();
  }, [restore]);

  // On small screens the sidebar is an overlay drawer — start collapsed and re-close it
  // after navigating. On desktop the collapse is a deliberate toggle, so leave it alone
  // across route changes. Runs on mount too (covers the initial small-screen collapse).
  useEffect(() => {
    if (window.matchMedia("(max-width: 640px)").matches) setNavOpen(false);
  }, [pathname]);

  const inPortal = pathname.startsWith("/portal");
  // Org-management sections — staff "agents" (role admin, manage=false) can't reach these.
  const inManagerArea = ["/clients", "/contacts", "/products", "/team", "/groups"].some((p) =>
    pathname.startsWith(p),
  );

  useEffect(() => {
    if (!booted) return;
    if (!session) router.replace("/login");
    else if (session.role === "client" && !inPortal) router.replace("/portal");
    else if (session.role === "admin" && inPortal) router.replace("/");
    else if (session.role === "admin" && !session.manage && inManagerArea) router.replace("/");
  }, [booted, session, inPortal, inManagerArea, router]);

  // Loading gate: wait until we know who (if anyone) is signed in.
  if (!booted) {
    return (
      <div
        className="app-boot"
        style={{ display: "grid", placeItems: "center", minHeight: "100vh", color: "var(--muted)" }}
      >
        Loading…
      </div>
    );
  }

  const mismatch =
    !session || (session.role === "client" && !inPortal) || (session.role === "admin" && inPortal);
  if (mismatch) return null;

  // The portal is a single page — give it a slim topbar-only shell, not the sidebar.
  if (inPortal) return <PortalShell>{children}</PortalShell>;

  return (
    <div className={`app-shell ${navOpen ? "nav-open" : ""}`}>
      <Sidebar />
      {navOpen && <div className="nav-scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />}
      <main className="main">
        <Topbar onMenu={() => setNavOpen((o) => !o)} />
        <div className="content">{children}</div>
      </main>
    </div>
  );
}
