"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useStore } from "@/store";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Chips";
import { clientContacts, initials, isActive } from "@/lib/helpers";

// `mine` marks an agent "my work" view (a /tickets link scoped by ?mine=<key>); `teamq`
// marks a single team's queue (?teamq=<team name>). Both make active state query-aware.
type NavItem = {
  to: string;
  label: string;
  icon: IconName;
  end: boolean;
  count?: number;
  manage?: boolean;
  mine?: string;
  teamq?: string;
};

export function Sidebar() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const mineParam = sp?.get("mine") ?? null;
  const teamqParam = sp?.get("teamq") ?? null;
  const session = useStore((s) => s.session);
  const tickets = useStore((s) => s.tickets);
  const clients = useStore((s) => s.clients);
  const members = useStore((s) => s.members);
  const groups = useStore((s) => s.groups);
  const products = useStore((s) => s.products);

  if (!session) return null;
  const admin = session.role === "admin";
  const isAgent = admin && !session.manage;
  // Footer line under the signed-in user's name: a member's own job title (falling back
  // to the generic team label when they have none), a fixed "Administrator" for managers
  // regardless of any title on their Team Member record, and client · division for POCs.
  const subtitle = !admin
    ? `${session.client} · ${session.div}`
    : isAgent
      ? session.title || "Inventive Support"
      : "Administrator";

  const activeCount = tickets.filter((t) => isActive(t.status)).length;
  const mine = tickets.filter((t) => t.client === session.client && t.div === session.div);
  const myActive = mine.filter((t) => isActive(t.status)).length;

  // Agent "my work" queue sizes — active tickets in each view (matches the app's
  // convention that a nav badge counts open work, while the list shows all statuses).
  const me = session.member;
  const teams = session.teams ?? [];
  const assignedToMe = tickets.filter((t) => t.assignee === me && isActive(t.status)).length;
  // Unclaimed (claimable) active tickets waiting in one specific team's queue.
  const teamQueueCount = (tm: string) =>
    tickets.filter((t) => t.group === tm && t.assignee === "Unassigned" && isActive(t.status)).length;
  const triageInbox = tickets.filter((t) => !t.group && isActive(t.status)).length;
  const collaborating = tickets.filter(
    (t) =>
      !!t.group &&
      !teams.includes(t.group) &&
      t.assignee !== me &&
      t.owner !== session.user &&
      isActive(t.status),
  ).length;

  // Distinct people, not a sum over divisions — a Lead on several divisions appears once
  // per division in the tree, and one with none appears in no division at all, so the sum
  // over-counted the first and lost the second. Note the Contacts page deliberately shows
  // one ROW per (contact, division) because it has a Division column, so its row count can
  // legitimately exceed this badge. This counts people.
  const pocCount = clients.reduce((n, c) => n + clientContacts(c).length, 0);
  const managerItems: NavItem[] = [
    { to: "/", label: "Dashboard", icon: "dashboard", end: true },
    { to: "/tickets", label: "Tickets", icon: "tickets", end: false, count: activeCount },
    { to: "/clients", label: "Clients", icon: "clients", end: false, count: clients.length, manage: true },
    { to: "/contacts", label: "Contacts", icon: "mail", end: false, count: pocCount, manage: true },
    {
      to: "/products",
      label: "Products",
      icon: "projects",
      end: false,
      // The catalogue size, which is what the Products page lists. It counted CLIENTS
      // holding the legacy single product — so the badge beside "Products" was neither a
      // product count nor correct once products moved to engagements.
      count: products.length,
      manage: true,
    },
    { to: "/members", label: "Members", icon: "user", end: false, count: members.length, manage: true },
    { to: "/teams", label: "Teams", icon: "grid", end: false, count: groups.length, manage: true },
  ];
  // Agents get their personal "my work" queues as primary nav instead of the org sections.
  const agentItems: NavItem[] = [
    { to: "/", label: "Dashboard", icon: "dashboard", end: true },
    { to: "/tickets", label: "All tickets", icon: "tickets", end: false, count: activeCount },
    {
      to: "/tickets?mine=me",
      label: "Assigned to me",
      icon: "user",
      end: false,
      count: assignedToMe,
      mine: "me",
    },
    {
      to: "/tickets?mine=triage",
      label: "Triage inbox",
      icon: "mail",
      end: false,
      count: triageInbox,
      mine: "triage",
    },
    {
      to: "/tickets?mine=collab",
      label: "Collaborating",
      icon: "chat",
      end: false,
      count: collaborating,
      mine: "collab",
    },
  ];
  // The member's team queues, listed by team NAME under a "My Team Queue" heading. One
  // entry per team the member belongs to (each counts only that team's unclaimed tickets);
  // a member on no team gets none.
  const teamQueueItems: NavItem[] = [...teams]
    .sort((a, b) => a.localeCompare(b))
    .map<NavItem>((tm) => ({
      to: `/tickets?teamq=${encodeURIComponent(tm)}`,
      label: tm,
      icon: "grid",
      end: false,
      count: teamQueueCount(tm),
      teamq: tm,
    }));
  const clientItems: NavItem[] = [
    { to: "/portal", label: "My Tickets", icon: "tickets", end: true, count: myActive },
  ];
  const items = admin ? (isAgent ? agentItems : managerItems) : clientItems;

  // Active state: a `mine` / `teamq` view lights up only when its query key is the active
  // one; the plain "/tickets" (All) view lights up on the list or a ticket detail, but
  // yields to a mine/teamq view when one is active; everything else is a plain path match.
  const itemActive = (it: NavItem) => {
    if (it.mine !== undefined) return pathname === "/tickets" && mineParam === it.mine;
    if (it.teamq !== undefined) return pathname === "/tickets" && teamqParam === it.teamq;
    if (it.to === "/tickets")
      return pathname.startsWith("/tickets") && !(pathname === "/tickets" && (mineParam || teamqParam));
    return it.end ? pathname === it.to : pathname.startsWith(it.to);
  };

  const renderItem = (it: NavItem) => (
    <Link
      key={it.to}
      href={it.to}
      className={itemActive(it) ? "active" : ""}
      aria-current={itemActive(it) ? "page" : undefined}
    >
      <Icon name={it.icon} size={18} strokeWidth={1.8} />
      <span className="nav-txt" title={it.label}>
        {it.label}
      </span>
      {it.count != null && (
        <Badge count className="count">
          {it.count}
        </Badge>
      )}
    </Link>
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-glyph">
          <Icon name="logo" size={18} />
        </span>
        <div className="t">
          Inventive Helpdesk<span>{admin ? (isAgent ? "Member" : "Admin") : "Portal"}</span>
        </div>
      </div>

      <nav className="nav">
        <div className="nav-label eyebrow">{isAgent ? "My work" : admin ? "Workspace" : "Support"}</div>
        {items.map(renderItem)}
        {isAgent && teamQueueItems.length > 0 && (
          <>
            <div className="nav-label eyebrow">My Team Queue</div>
            {teamQueueItems.map(renderItem)}
          </>
        )}
      </nav>

      <div className="sidebar-foot">
        <div className="who">
          <span className="who-av">
            <span className={`avatar ${admin ? "" : "client"}`}>{admin ? "A" : initials(session.name)}</span>
            <span className="who-dot" title="Online" />
          </span>
          <div className="m">
            <div className="who-name">{session.name}</div>
            {/* A member's job title identifies them better than the org name; it's free
                text and often blank, so fall back to the generic label. Wraps at word
                boundaries (see .who .m span) rather than truncating. */}
            <span title={subtitle}>{subtitle}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
