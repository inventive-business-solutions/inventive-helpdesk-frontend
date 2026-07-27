"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../../store";
import { Button } from "../ui/Button";
import { BackButton } from "../ui/BackButton";
import { ListToolbar } from "../ui/ListToolbar";
import { MasterTruncationNotice } from "../ui/TruncationNotice";
import { applySort, commonSorts, countSort, matches, useStoredSort } from "../../lib/listview";
import { Icon } from "../ui/Icon";
import { ManageButton } from "../ui/ManageButton";
import { Badge } from "../ui/Chips";
import { EmptyState } from "../ui/EmptyState";
import { AddMemberModal } from "../modals/AddMemberModal";
import { EditMemberModal } from "../modals/EditMemberModal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Pagination } from "../ui/Pagination";
import { useSubmit } from "../ui/useSubmit";
import { initials, memberStatusTone } from "../../lib/helpers";
import type { TeamMember } from "../../types";

export function Team() {
  const members = useStore((s) => s.members);
  const groups = useStore((s) => s.groups);
  const tickets = useStore((s) => s.tickets);
  const removeMember = useStore((s) => s.removeMember);
  const sendInvite = useStore((s) => s.sendInvite);
  const { busy, run } = useSubmit();
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<TeamMember | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [q, setQ] = useState("");

  // useCallback so the search memo below can depend on it directly rather than on
  // `groups`, which is what it actually closes over.
  const memberGroups = useCallback(
    (name: string) => groups.filter((g) => g.members.includes(name)).map((g) => g.name),
    [groups],
  );

  // Assigned-ticket counts, built once per render pass rather than inside the comparator:
  // a sort is O(n log n) comparisons, and counting the ticket array inside each one would
  // turn a cheap sort into a quadratic scan of every ticket.
  const assignedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) if (t.assignee) m.set(t.assignee, (m.get(t.assignee) ?? 0) + 1);
    return m;
  }, [tickets]);

  const sortOptions = useMemo(
    () => [
      ...commonSorts<TeamMember>(
        (m) => m.name,
        (m) => m,
      ),
      countSort<TeamMember>(
        "tickets",
        "Most assigned",
        (m) => assignedCount.get(m.name) ?? 0,
        (m) => m.name,
      ),
    ],
    [assignedCount],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("members", sortKeys);

  // Search covers the columns actually on screen — name, title, email — plus the teams
  // they belong to, since "who is on the Boiler team" is a question this table answers.
  const filtered = useMemo(
    () => members.filter((m) => matches(q, m.name, m.title, m.email, ...memberGroups(m.name))),
    [members, memberGroups, q],
  );
  const shown = useMemo(() => applySort(filtered, sortOptions, sort), [filtered, sortOptions, sort]);

  // Grammatical "a, b and c".
  const joinList = (items: string[]) =>
    items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

  // Spell out what deleting a member does: their tickets go Unassigned, they leave any
  // teams, and their sign-in is revoked — so the admin knows the consequences up front.
  const removeMessage = (name: string) => {
    const n = tickets.filter((t) => t.assignee === name).length;
    const gs = memberGroups(name);
    const ticketPart =
      n === 0 ? "isn't assigned to any tickets" : `is assigned to ${n} ticket${n === 1 ? "" : "s"}`;
    const teamPart = gs.length ? `and is on ${joinList(gs)}` : "and isn't on any team";
    const effects = [
      n > 0 && `move ${n === 1 ? "that ticket" : "those tickets"} to Unassigned`,
      gs.length && "remove them from those teams",
      "revoke their sign-in",
    ].filter(Boolean) as string[];
    return `${name} ${ticketPart} ${teamPart}. Removing them will ${joinList(effects)}. This can't be undone.`;
  };

  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageMembers = shown.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  // Back to page 1 whenever the result set changes, so narrowing the list never leaves
  // you stranded on a page that no longer exists.
  useEffect(() => setPage(1), [q, sort]);

  return (
    <>
      <div className="page-head">
        <BackButton />
        <div>
          <h1>Members</h1>
          <p>People you can assign tickets to. Invite them to set up a portal password.</p>
        </div>
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowAdd(true)}>
          Add member
        </Button>
      </div>

      <MasterTruncationNotice what="some members are not shown" />

      <ListToolbar
        query={q}
        onQuery={setQ}
        placeholder="Search members…"
        sortOptions={sortOptions}
        sort={sort}
        onSort={setSort}
        count={shown.length}
        unit="member"
        onClearAll={q ? () => setQ("") : undefined}
      />

      <div className="card">
        <div className="table-wrap">
          <table className="tk tk-members">
            <colgroup>
              <col style={{ width: "20%" }} />
              {/* Name */}
              <col style={{ width: "14%" }} />
              {/* Title */}
              <col style={{ width: "20%" }} />
              {/* Email — the longest data, keep ≥20% */}
              <col style={{ width: "12%" }} />
              {/* Status — fits the "Not Invited" chip */}
              <col style={{ width: "12%" }} />
              {/* Teams */}
              <col style={{ width: "22%" }} />
              {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th className="left">Name</th>
                <th className="left">Title</th>
                <th className="left">Email</th>
                <th className="center">Status</th>
                <th className="left">Teams</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageMembers.map((m) => {
                const mg = memberGroups(m.name);
                return (
                  <tr key={m.name}>
                    <td className="t-title" title={m.name}>
                      <span className="row-av">{initials(m.name)}</span>
                      {m.name}
                    </td>
                    <td className="t-cd left" title={m.title || undefined}>
                      {m.title || <span className="muted">—</span>}
                    </td>
                    <td className="t-cd left" title={m.email}>
                      {m.email}
                    </td>
                    <td className="center">
                      <Badge tone={memberStatusTone(m.status)}>{m.status}</Badge>
                    </td>
                    <td className="t-cd left">
                      {mg.length ? (
                        <span className="chip-wrap">
                          {mg.map((g) => (
                            <Badge round key={g}>
                              {g}
                            </Badge>
                          ))}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="center">
                      <div className="row-actions">
                        <Button
                          variant="ghost"
                          className="invite-btn"
                          onClick={() =>
                            run(() => sendInvite(m.name), { success: `Invite sent to ${m.email}` })
                          }
                        >
                          {m.status === "Invited" ? "Resend invite" : "Send invite"}
                        </Button>
                        <ManageButton subject={m.name} onClick={() => setEditTarget(m)} />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    {/* An empty table means two different things — nobody has been added
                        yet, or the search excluded everyone. Telling them apart is the
                        difference between "add your first" and "your filter is too tight". */}
                    <EmptyState>
                      {members.length === 0 ? (
                        <>
                          No members yet — use <b>Add member</b> to add your first.
                        </>
                      ) : (
                        <>
                          No members match <b>{q}</b>.
                        </>
                      )}
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          total={shown.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit="members"
        />
      </div>

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} />}
      {editTarget && (
        <EditMemberModal
          member={editTarget}
          onClose={() => setEditTarget(null)}
          onDelete={() => {
            const target = editTarget.name;
            setEditTarget(null);
            setRemoveTarget(target);
          }}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          title="Remove member"
          message={removeMessage(removeTarget)}
          confirmLabel="Remove member"
          busy={busy}
          onConfirm={() =>
            run(() => removeMember(removeTarget), {
              success: `${removeTarget} removed`,
              onSuccess: () => setRemoveTarget(null),
            })
          }
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </>
  );
}
