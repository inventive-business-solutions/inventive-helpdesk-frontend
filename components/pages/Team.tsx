"use client";
import { useState } from "react";
import { useStore } from "../../store";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
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

  const memberGroups = (name: string) => groups.filter((g) => g.members.includes(name)).map((g) => g.name);

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

  const totalPages = Math.max(1, Math.ceil(members.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageMembers = members.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Members</h1>
          <p>People you can assign tickets to. Invite them to set up a portal password.</p>
        </div>
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowAdd(true)}>
          Add member
        </Button>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tk tk-members">
            <colgroup>
              <col style={{ width: "20%" }} /> {/* Name */}
              <col style={{ width: "14%" }} /> {/* Title */}
              <col style={{ width: "20%" }} /> {/* Email — the longest data, keep ≥20% */}
              <col style={{ width: "12%" }} /> {/* Status — fits the "Not Invited" chip */}
              <col style={{ width: "12%" }} /> {/* Teams */}
              <col style={{ width: "22%" }} /> {/* Actions */}
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
                        <IconButton
                          icon={<Icon name="pencil" />}
                          label="Edit member"
                          onClick={() => setEditTarget(m)}
                        />
                        <IconButton
                          icon={<Icon name="x" />}
                          label="Remove member"
                          onClick={() => setRemoveTarget(m.name)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {members.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState>
                      No members yet — use <b>Add member</b> to add your first.
                    </EmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          total={members.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit="members"
        />
      </div>

      {showAdd && <AddMemberModal onClose={() => setShowAdd(false)} />}
      {editTarget && <EditMemberModal member={editTarget} onClose={() => setEditTarget(null)} />}
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
