"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Kpi } from "@/components/ui/Kpi";
import { Segmented } from "@/components/ui/Segmented";
import { BarList, type BarRow } from "@/components/ui/BarList";
import { TicketTable } from "@/components/ui/TicketTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { IdChip } from "@/components/ui/Chips";
import { WelcomeHeader } from "@/components/ui/WelcomeHeader";
import { NewTicketModal } from "@/components/modals/NewTicketModal";
import { useSubmit } from "@/components/ui/useSubmit";
import { RESOLVED, enc, isActive, needsAttention } from "@/lib/helpers";
import type { Priority, Status } from "@/types";

// Only the open statuses matter for "my open tickets" (Resolved/Closed excluded).
const OPEN_STATUS_ORDER: Status[] = ["New", "Acknowledged", "In Progress", "Pending Client", "Reopened"];
const STATUS_COLOR: Record<string, string> = {
  New: "var(--info)",
  Acknowledged: "var(--ink-2)",
  "In Progress": "var(--accent)",
  "Pending Client": "var(--warning)",
  Reopened: "var(--critical)",
};
const PRIORITY_ORDER: Priority[] = ["Critical", "High", "Medium", "Low"];
const PRIORITY_COLOR: Record<Priority, string> = {
  Critical: "var(--critical)",
  High: "var(--serious)",
  Medium: "var(--warning)",
  Low: "var(--muted)",
};

/** The agent (member) landing dashboard: a focused "my work" cockpit. Managers keep the
 *  org dashboard (see Dashboard.tsx dispatcher). Every tile links to the matching scoped
 *  /tickets view, and the counts mirror the sidebar definitions (active-only) exactly. */
export function AgentDashboard() {
  const router = useRouter();
  const go = (href: string) => router.push(href);
  const session = useStore((s) => s.session);
  const tickets = useStore((s) => s.tickets);
  const unread = useStore((s) => s.unread);
  const claimTicket = useStore((s) => s.claimTicket);
  const { busy, run } = useSubmit();
  const [showNew, setShowNew] = useState(false);
  const [dim, setDim] = useState<"Status" | "Priority">("Status");
  const [activity, setActivity] = useState<"attention" | "recent">("attention");

  const me = session?.member;
  const teams = session?.teams ?? [];

  // All slices derive from the (already backend-scoped) ticket set — no extra fetch.
  const s = useMemo(() => {
    const user = session?.user;
    const teamSet = new Set(session?.teams ?? []);
    const mineTickets = tickets.filter((t) => !!me && t.assignee === me);
    return {
      assignedActive: mineTickets.filter((t) => isActive(t.status)),
      attention: mineTickets.filter(needsAttention),
      sla: mineTickets.filter((t) => t.slaRisk && isActive(t.status)),
      resolved: mineTickets.filter((t) => RESOLVED.includes(t.status)),
      triage: tickets.filter((t) => !t.group && isActive(t.status)).length,
      collaborating: tickets.filter(
        (t) =>
          !!t.group && !teamSet.has(t.group) && t.assignee !== me && t.owner !== user && isActive(t.status),
      ).length,
      // Claimable pool across my teams, newest first.
      claimable: tickets
        .filter((t) => !!t.group && teamSet.has(t.group) && t.assignee === "Unassigned" && isActive(t.status))
        .sort((a, b) => (b.createdISO || "").localeCompare(a.createdISO || "")),
      // My tickets, newest activity first (all statuses, so recently-resolved surface too).
      recent: [...mineTickets].sort((a, b) => (b.updatedISO || "").localeCompare(a.updatedISO || "")),
    };
  }, [tickets, me, session]);

  const workloadRows: BarRow[] =
    dim === "Status"
      ? OPEN_STATUS_ORDER.map((st) => ({
          label: st,
          value: s.assignedActive.filter((t) => t.status === st).length,
          color: STATUS_COLOR[st],
          href: `/tickets?mine=me&status=${enc(st)}&active=1`,
        })).filter((r) => r.value > 0)
      : PRIORITY_ORDER.map((p) => ({
          label: p,
          value: s.assignedActive.filter((t) => t.priority === p).length,
          color: PRIORITY_COLOR[p],
          href: `/tickets?mine=me&priority=${enc(p)}&active=1`,
        })).filter((r) => r.value > 0);

  const sortedTeams = [...teams].sort((a, b) => a.localeCompare(b));
  const activityRows = (activity === "attention" ? s.attention : s.recent).slice(0, 6);

  return (
    <>
      <WelcomeHeader
        name={session?.name || ""}
        eyebrow="My work"
        subtitle="Your assigned tickets, team queues, and what needs you — every tile opens the matching list."
      >
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowNew(true)}>
          New ticket
        </Button>
      </WelcomeHeader>

      <div className="kpi-grid">
        <Kpi
          label="Assigned to me"
          value={s.assignedActive.length}
          sub="Open and unresolved"
          color="var(--accent)"
          onClick={() => go("/tickets?mine=me&active=1")}
        />
        <Kpi
          label="Needs attention"
          value={s.attention.length}
          sub="New, stale or at risk"
          color="var(--warning)"
          onClick={() => go("/tickets?mine=me&attention=1")}
        />
        <Kpi
          label="SLA at risk"
          value={s.sla.length}
          sub="Overdue or due soon"
          color="var(--critical)"
          onClick={() => go("/tickets?mine=me&sla=1")}
        />
        <Kpi
          label="Resolved"
          value={s.resolved.length}
          sub="This cycle"
          color="var(--good)"
          onClick={() => go("/tickets?mine=me&resolved=1")}
        />
      </div>

      <div className="dash-split">
        <div className="card">
          <div className="card-head">
            <h3>Pick up work</h3>
          </div>
          <div className="card-body">
            <div className="na-legend">
              {sortedTeams.map((tm) => {
                const n = tickets.filter(
                  (t) => t.group === tm && t.assignee === "Unassigned" && isActive(t.status),
                ).length;
                return (
                  <button
                    key={tm}
                    type="button"
                    className="na-leg"
                    onClick={() => go(`/tickets?teamq=${enc(tm)}`)}
                  >
                    <span className="na-dot" style={{ background: "var(--accent)" }} />
                    <span className="na-leg-label">{tm} queue</span>
                    <span className="na-leg-sub">Unclaimed — ready to pick up</span>
                    <span className="na-leg-val">{n}</span>
                  </button>
                );
              })}
              <button type="button" className="na-leg" onClick={() => go("/tickets?mine=triage")}>
                <span className="na-dot" style={{ background: "var(--warning)" }} />
                <span className="na-leg-label">Triage inbox</span>
                <span className="na-leg-sub">New / unrouted — route to a team</span>
                <span className="na-leg-val">{s.triage}</span>
              </button>
              <button type="button" className="na-leg" onClick={() => go("/tickets?mine=collab")}>
                <span className="na-dot" style={{ background: "var(--info)" }} />
                <span className="na-leg-label">Collaborating</span>
                <span className="na-leg-sub">Looped in to help</span>
                <span className="na-leg-val">{s.collaborating}</span>
              </button>
              {teams.length === 0 && (
                <p className="rail-hint">You're not on a team yet — ask an admin to add you to one.</p>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>My open tickets</h3>
          </div>
          <div className="card-body">
            <Segmented
              fullWidth
              ariaLabel="Breakdown dimension"
              options={[
                { key: "Status", label: "Status" },
                { key: "Priority", label: "Priority" },
              ]}
              value={dim}
              onChange={(k) => setDim(k as "Status" | "Priority")}
            />
            <div style={{ marginTop: 12 }}>
              {workloadRows.length ? (
                <BarList rows={workloadRows} onSelect={go} />
              ) : (
                <div className="bd-empty">Nothing open assigned to you.</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Ready to pick up</h3>
          <button className="link" onClick={() => go("/tickets?astate=team&active=1")}>
            View all
          </button>
        </div>
        <div className="card-body">
          {s.claimable.length ? (
            <div className="claim-list">
              {s.claimable.slice(0, 6).map((t) => (
                <div className="claim-row" key={t.id}>
                  <button type="button" className="claim-main" onClick={() => go(`/tickets/${t.id}`)}>
                    <IdChip id={t.id} />
                    <span className="claim-title">{t.title}</span>
                    <span className="claim-team">{t.group}</span>
                    <span className="claim-prio">
                      <span className="dot" style={{ background: PRIORITY_COLOR[t.priority] }} />
                      {t.priority}
                    </span>
                    <span className="claim-age">{t.age}</span>
                  </button>
                  <Button
                    variant="primary"
                    icon={<Icon name="check" size={15} />}
                    onClick={() => run(() => claimTicket(t.id), { success: "Claimed — assigned to you" })}
                    disabled={busy}
                  >
                    Claim
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState>No unclaimed tickets in your teams right now.</EmptyState>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Your activity</h3>
          {activity === "attention" && (
            <button className="link" onClick={() => go("/tickets?mine=me&attention=1")}>
              View all
            </button>
          )}
        </div>
        <div className="card-body" style={{ paddingBottom: 12 }}>
          <Segmented
            fullWidth
            ariaLabel="Activity view"
            options={[
              { key: "attention", label: "Needs your attention", count: s.attention.length },
              { key: "recent", label: "Recently updated" },
            ]}
            value={activity}
            onChange={(k) => setActivity(k as "attention" | "recent")}
          />
        </div>
        <div className="table-wrap">
          <TicketTable
            tickets={activityRows}
            unread={unread}
            onOpen={(id) => go(`/tickets/${id}`)}
            empty={
              <EmptyState>
                {activity === "attention"
                  ? "Nothing needs your attention right now."
                  : "No recent activity on your tickets."}
              </EmptyState>
            }
          />
        </div>
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </>
  );
}
