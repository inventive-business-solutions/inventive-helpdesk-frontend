"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Segmented } from "@/components/ui/Segmented";
import { TicketTable } from "@/components/ui/TicketTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { BarList, type BarRow } from "@/components/ui/BarList";
import { BreakdownModal } from "@/components/modals/BreakdownModal";
import { NewTicketModal } from "@/components/modals/NewTicketModal";
import { AgentDashboard } from "@/components/pages/AgentDashboard";
import { WelcomeHeader } from "@/components/ui/WelcomeHeader";
import { RESOLVED, enc, isActive, needsAttention, parseISO } from "@/lib/helpers";
import type { Priority, Status, TicketType } from "@/types";

const RANGES: { key: string; weeks: number }[] = [
  { key: "4w", weeks: 4 },
  { key: "8w", weeks: 8 },
  { key: "12w", weeks: 12 },
];

const STATUS_ORDER: Status[] = [
  "New",
  "Acknowledged",
  "In Progress",
  "Pending Client",
  "Reopened",
  "Resolved",
  "Closed",
];
const STATUS_COLOR: Record<Status, string> = {
  New: "var(--info)",
  Acknowledged: "var(--ink-2)",
  "In Progress": "var(--accent)",
  "Pending Client": "var(--warning)",
  Reopened: "var(--critical)",
  Resolved: "var(--good)",
  Closed: "var(--muted)",
};
const PRIORITY_ORDER: Priority[] = ["Critical", "High", "Medium", "Low"];
const PRIORITY_COLOR: Record<Priority, string> = {
  Critical: "var(--critical)",
  High: "var(--serious)",
  Medium: "var(--warning)",
  Low: "var(--muted)",
};
const TYPES: TicketType[] = ["Bug", "Query", "Improvement", "New Feature"];
const TYPE_COLOR: Record<TicketType, string> = {
  Bug: "var(--cat-1)",
  Query: "var(--cat-2)",
  Improvement: "var(--cat-3)",
  "New Feature": "var(--cat-4)",
};
const PALETTE = [
  "var(--cat-1)",
  "var(--cat-2)",
  "var(--cat-3)",
  "var(--cat-4)",
  "var(--accent)",
  "var(--muted)",
];

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Real created-vs-resolved weekly trend from the loaded tickets (resolved =
 *  created that week and now in a resolved state). Keyed off the raw ISO
 *  timestamp, not a re-parsed display string. */
function buildTrend(tickets: { createdISO?: string; status: Status }[], weeks: number) {
  const dated = tickets
    .map((t) => ({ d: parseISO(t.createdISO), resolved: RESOLVED.includes(t.status) }))
    .filter((x): x is { d: Date; resolved: boolean } => !!x.d);
  if (!dated.length) return [];
  const latest = new Date(Math.max(...dated.map((x) => x.d.getTime())));
  const out: { week: string; created: number; resolved: number }[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const end = new Date(latest);
    end.setDate(end.getDate() - i * 7);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    const inWeek = dated.filter((x) => x.d >= start && x.d <= end);
    out.push({
      week: `${MONTHS_SHORT[start.getMonth()]} ${start.getDate()}`,
      created: inWeek.length,
      resolved: inWeek.filter((x) => x.resolved).length,
    });
  }
  return out;
}

// Members (staff agents) get a focused "my work" cockpit; managers/System Manager get the
// org dashboard below. Split at the top so hooks stay unconditional in each component.
export function Dashboard() {
  const session = useStore((s) => s.session);
  const isAgent = session?.role === "admin" && !session.manage;
  // Set the tab title client-side (the home URL has no static title, to avoid a "Dashboard"
  // flash before the signed-out redirect). Matches the in-page heading per role.
  useEffect(() => {
    document.title = `${isAgent ? "My work" : "Dashboard"} · Inventive Helpdesk`;
  }, [isAgent]);
  return isAgent ? <AgentDashboard /> : <ManagerDashboard />;
}

function ManagerDashboard() {
  const router = useRouter();
  const go = (href: string) => router.push(href);
  const session = useStore((s) => s.session);
  const tickets = useStore((s) => s.tickets);
  const unread = useStore((s) => s.unread);
  const clients = useStore((s) => s.clients);
  const members = useStore((s) => s.members);
  const groups = useStore((s) => s.groups);
  const [showNew, setShowNew] = useState(false);
  // The breakdown whose full list is open in a popup (null = closed).
  const [breakdown, setBreakdown] = useState<{ title: string; rows: BarRow[] } | null>(null);
  const [range, setRange] = useState("8w");
  const [tab, setTab] = useState("Priority"); // selected Ticket-breakdown dimension

  // KPI/table slices — recomputed only when the ticket set changes.
  const { active, resolved, pendingAction, slaRisk, emailTickets, toSystem, toMember } = useMemo(() => {
    const active = tickets.filter((t) => isActive(t.status));
    return {
      active,
      resolved: tickets.filter((t) => RESOLVED.includes(t.status)),
      pendingAction: tickets.filter(needsAttention),
      slaRisk: tickets.filter((t) => t.slaRisk && isActive(t.status)),
      emailTickets: tickets.filter((t) => t.source === "Email"),
      // Assignment gaps among open tickets: no team at all (To System — where new
      // email tickets land) vs assigned to a team but no member yet (To Member).
      toSystem: active.filter((t) => !t.group && t.assignee === "Unassigned").length,
      toMember: active.filter((t) => t.group && t.assignee === "Unassigned").length,
    };
  }, [tickets]);

  const trendData = useMemo(
    () => buildTrend(tickets, RANGES.find((r) => r.key === range)?.weeks ?? 8),
    [tickets, range],
  );

  // Each breakdown is one tab of the Ticket-breakdown chart. `dynamic` lists grow with
  // the data (clients/members/teams) and cap at 8 rows with a "+N more" → full-list popup.
  const breakdowns: { tab: string; title: string; rows: BarRow[]; dynamic?: boolean }[] = useMemo(() => {
    const priorityRows: BarRow[] = PRIORITY_ORDER.map((p) => ({
      label: p,
      value: active.filter((t) => t.priority === p).length,
      color: PRIORITY_COLOR[p],
      href: `/tickets?priority=${enc(p)}&active=1`,
    }));
    const statusRows: BarRow[] = STATUS_ORDER.map((st) => ({
      label: st,
      value: tickets.filter((t) => t.status === st).length,
      color: STATUS_COLOR[st],
      href: `/tickets?status=${enc(st)}`,
    }));
    const typeRows: BarRow[] = TYPES.map((t) => ({
      label: t,
      value: active.filter((x) => x.type === t).length,
      color: TYPE_COLOR[t],
      href: `/tickets?type=${enc(t)}&active=1`,
    }));
    // The growing lists rank by load (busiest first); ties keep source order (stable sort).
    const byCount = (a: BarRow, b: BarRow) => b.value - a.value;
    const clientRows: BarRow[] = clients
      .map((cl, i) => ({
        label: cl.name,
        value: active.filter((t) => t.client === cl.name).length,
        color: PALETTE[i % PALETTE.length],
        href: `/tickets?client=${enc(cl.name)}&active=1`,
      }))
      .sort(byCount);
    // Members ranked by load (busiest first), and only those actually carrying
    // tickets — members with 0 open tickets are hidden to keep the list tight.
    const workloadRows: BarRow[] = members
      .map((m, i) => ({
        label: m.name,
        value: active.filter((t) => t.assignee === m.name).length,
        color: PALETTE[i % PALETTE.length],
        href: `/tickets?assignee=${enc(m.name)}&active=1`,
      }))
      .filter((r) => r.value > 0)
      .sort(byCount);
    // Teams ranked by load. Unrouted tickets aren't shown here — they live in the
    // "Needs assignment" card as "To System".
    const groupRows: BarRow[] = groups
      .map((g, i) => ({
        label: g.name,
        value: active.filter((t) => t.group === g.name).length,
        color: PALETTE[i % PALETTE.length],
        href: `/tickets?group=${enc(g.name)}&active=1`,
      }))
      .sort(byCount);
    return [
      { tab: "Priority", title: "Open by priority", rows: priorityRows },
      { tab: "Type", title: "Open by type", rows: typeRows },
      { tab: "Status", title: "Pipeline by status", rows: statusRows },
      { tab: "Client", title: "Open by client", rows: clientRows, dynamic: true },
      { tab: "Member", title: "Member workload", rows: workloadRows, dynamic: true },
      { tab: "Team", title: "Team workload", rows: groupRows, dynamic: true },
    ];
  }, [active, tickets, clients, members, groups]);

  // The dimension currently shown in the Ticket-breakdown chart (tab defaults to Priority).
  const activeDim = breakdowns.find((b) => b.tab === tab) ?? breakdowns[0];

  // "Needs assignment" donut: split the pending tickets between To System (amber) and
  // To Member (indigo); a full green ring when nothing is waiting.
  const totalPending = toSystem + toMember;
  const sysPct = totalPending ? (toSystem / totalPending) * 100 : 0;
  const pieBg =
    totalPending === 0
      ? "conic-gradient(var(--good) 0 100%)"
      : `conic-gradient(var(--warning) 0 ${sysPct}%, var(--accent) ${sysPct}% 100%)`;

  return (
    <>
      <WelcomeHeader
        name={session?.name || ""}
        eyebrow="Dashboard"
        subtitle="Your support health at a glance — every tile opens the matching list."
      >
        <Segmented
          role="group"
          ariaLabel="Trend range"
          options={RANGES.map((r) => ({ key: r.key, label: r.key }))}
          value={range}
          onChange={setRange}
        />
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowNew(true)}>
          New ticket
        </Button>
      </WelcomeHeader>

      <div className="kpi-grid">
        <Kpi
          label="Open tickets"
          value={active.length}
          sub={`Across ${new Set(active.map((t) => t.client)).size} clients`}
          color="var(--accent)"
          onClick={() => go("/tickets?active=1")}
        />
        <Kpi
          label="Resolved"
          value={resolved.length}
          sub="This cycle"
          color="var(--good)"
          onClick={() => go("/tickets?resolved=1")}
        />
        <Kpi
          label="Needs attention"
          value={pendingAction.length}
          sub="Unassigned or stale"
          color="var(--warning)"
          onClick={() => go("/tickets?attention=1")}
        />
        <Kpi
          label="SLA at risk"
          value={slaRisk.length}
          sub="Overdue or due soon"
          color="var(--critical)"
          onClick={() => go("/tickets?sla=1")}
        />
      </div>

      <div className="dash-split">
        <div className="card na-card">
          <div className="card-head">
            <h3>Needs assignment</h3>
          </div>
          <div className="card-body">
            <div className="na-pie-row">
              <div className="na-pie-wrap">
                <div className="na-pie" style={{ background: pieBg }} />
                <div className="na-pie-center">
                  <span className="na-pie-total">{totalPending}</span>
                  <span className="na-pie-cap">To assign</span>
                </div>
              </div>
              <div className="na-legend">
                <button
                  type="button"
                  className="na-leg"
                  onClick={() => go("/tickets?astate=unassigned&active=1")}
                >
                  <span className="na-dot" style={{ background: "var(--warning)" }} />
                  <span className="na-leg-label">To System</span>
                  <span className="na-leg-sub">No team yet</span>
                  <span className="na-leg-val">{toSystem}</span>
                </button>
                <button type="button" className="na-leg" onClick={() => go("/tickets?astate=team&active=1")}>
                  <span className="na-dot" style={{ background: "var(--accent)" }} />
                  <span className="na-leg-label">To Member</span>
                  <span className="na-leg-sub">Awaiting a member</span>
                  <span className="na-leg-val">{toMember}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Ticket breakdown</h3>
          </div>
          <div className="card-body">
            <Segmented
              className="bd-tabs"
              fullWidth
              ariaLabel="Breakdown dimension"
              options={breakdowns.map((b) => ({ key: b.tab, label: b.tab }))}
              value={tab}
              onChange={setTab}
            />
            <p className="bd-cap">{activeDim.title}</p>
            {activeDim.rows.length ? (
              <BarList
                rows={activeDim.rows}
                onSelect={go}
                limit={activeDim.dynamic ? 8 : undefined}
                onMore={
                  activeDim.dynamic
                    ? () => setBreakdown({ title: activeDim.title, rows: activeDim.rows })
                    : undefined
                }
              />
            ) : (
              <div className="bd-empty">Nothing to show yet.</div>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Tickets created vs resolved</h3>
          <div className="chart-legend">
            <span className="leg">
              <span className="sw" style={{ background: "var(--accent)" }} /> Created
            </span>
            <span className="leg">
              <span className="sw" style={{ background: "var(--good)" }} /> Resolved
            </span>
          </div>
        </div>
        <div className="card-body">
          <TrendChart data={trendData} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Needs attention</h3>
          <button className="link" onClick={() => go("/tickets?attention=1")}>
            View all
          </button>
        </div>
        <div className="table-wrap">
          <TicketTable
            tickets={pendingAction.slice(0, 6)}
            unread={unread}
            onOpen={(id) => go(`/tickets/${id}`)}
            empty={<EmptyState>Nothing needs attention right now.</EmptyState>}
          />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Inbound email</h3>
          <button className="link" onClick={() => go("/tickets?source=Email")}>
            View all
          </button>
        </div>
        <div className="table-wrap">
          <TicketTable
            tickets={emailTickets.slice(0, 6)}
            unread={unread}
            onOpen={(id) => go(`/tickets/${id}`)}
            empty={<EmptyState>Nothing has arrived by email yet.</EmptyState>}
          />
        </div>
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
      {breakdown && (
        <BreakdownModal
          title={breakdown.title}
          rows={breakdown.rows}
          onSelect={(href) => {
            setBreakdown(null);
            go(href);
          }}
          onClose={() => setBreakdown(null)}
        />
      )}
    </>
  );
}
