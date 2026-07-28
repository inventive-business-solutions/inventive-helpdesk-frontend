"use client";
import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { Button } from "../ui/Button";
import { BackButton } from "../ui/BackButton";
import { ListToolbar } from "../ui/ListToolbar";
import { MasterTruncationNotice } from "../ui/TruncationNotice";
// Not `byName` — this file already has a local one that looks a member up by name, and
// importing the comparator under the same identifier would shadow it.
import { applySort, commonSorts, countSort, matches, useStoredSort } from "../../lib/listview";
import { usePagedState } from "../../lib/usePagedState";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { ManageButton } from "../ui/ManageButton";
import { EmptyState } from "../ui/EmptyState";
import { Pagination } from "../ui/Pagination";
import { Select } from "../ui/Select";
import { CreateGroupModal } from "../modals/CreateGroupModal";
import { AddGroupMemberModal } from "../modals/AddGroupMemberModal";
import { EditGroupModal } from "../modals/EditGroupModal";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { useSubmit } from "../ui/useSubmit";
import { initials } from "../../lib/helpers";
import type { Group, TeamMember } from "../../types";

const MEMBER_PAGE_SIZES = [5, 10, 15]; // "Members per team": default 5, grows in 5s

type Confirm = { kind: "group"; group: string } | { kind: "member"; group: string; member: string };

/** A single team card. Shows up to `perPage` members with its own Prev/Next pager;
 *  the page size is controlled globally from the bottom of the Teams page. */
function TeamCard({
  group,
  byName,
  perPage,
  onAddMember,
  onManage,
  onRemoveMember,
}: {
  group: Group;
  byName: (n: string) => TeamMember | undefined;
  perPage: number;
  onAddMember: () => void;
  onManage: () => void;
  onRemoveMember: (member: string) => void;
}) {
  // Resets when the global "members per team" size changes — a page 3 sized for 5 rows
  // is not page 3 sized for 15.
  const [page, setPage] = usePagedState([perPage]);

  const total = group.members.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageSafe = Math.min(page, totalPages);
  const shown = group.members.slice((pageSafe - 1) * perPage, pageSafe * perPage);

  return (
    <div className="card client-card">
      <div className="cc-head">
        <div className="cb-logo" style={{ width: 38, height: 38 }}>
          <Icon name="grid" size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="nm" style={{ fontSize: 16, fontWeight: 700 }}>
            {group.name}
          </div>
          {/* No member count on this line. It used to sit here while the section below was
              labelled "MEMBERS", so the card said the same word twice, six pixels apart.
              The count moved into that eyebrow: one statement instead of two, and it gives
              the section head something on its left so the button is not floating alone
              against an empty row.

              The lead line, by contrast, is always shown — including when there is none.
              "Team Lead: None" is a fact about the team; dropping the line when unset would
              leave the reader unable to tell "nobody leads this" from "this card does not
              report leads". */}
          <div className="team-lead">
            Team Lead: <span className="tl-name">{group.lead ?? "None"}</span>
          </div>
        </div>
        {/* One control, the same 108px ManageButton every other section's header uses —
            this card was the only place in the app doing something different. Deleting
            lives inside it rather than as a bare ✕ here, the move Products and Team already
            made. Adding a member is not a peer of Manage and no longer sits beside it: it
            belongs to the members list and moved to that list's own section head. */}
        <div className="cc-actions">
          <ManageButton subject={group.name} onClick={onManage} />
        </div>
      </div>
      {/* The same section head the client card uses for Products and Client leads: eyebrow
          on the left, its one add control on the right. Adding a member belongs to the
          members list, not beside Manage in the card header — and it only exists here, on a
          card, which is to say only once the team has been created. */}
      <div className="cc-section-head team-section-head">
        <span className="eyebrow">
          {total} {total === 1 ? "member" : "members"}
        </span>
        <Button variant="ghost" icon={<Icon name="plus" size={13} />} onClick={onAddMember}>
          Member
        </Button>
      </div>
      <div className="table-wrap">
        <table className="tk tk-fixed">
          <colgroup>
            <col style={{ width: "33%" }} />
            {/* Name */}
            <col style={{ width: "24%" }} />
            {/* Title */}
            <col style={{ width: "31%" }} />
            {/* Email — the longest data, keep ≥20% */}
            <col style={{ width: "12%" }} />
            {/* Actions */}
          </colgroup>
          <thead>
            <tr>
              <th className="left">Name</th>
              <th className="left">Title</th>
              <th className="left">Email</th>
              <th className="center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {total ? (
              shown.map((n) => {
                const m = byName(n);
                return (
                  <tr key={n}>
                    <td className="t-title" title={n}>
                      <span className="row-av">{initials(n)}</span>
                      {n}
                    </td>
                    <td className="t-cd left" title={m?.title || undefined}>
                      {m?.title || <span className="muted">—</span>}
                    </td>
                    <td className="t-cd left" title={m?.email || undefined}>
                      {m?.email || "—"}
                    </td>
                    <td className="center">
                      <IconButton
                        icon={<Icon name="x" />}
                        label="Remove from team"
                        onClick={() => onRemoveMember(n)}
                      />
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4}>
                  <EmptyState>
                    No members yet — use <b>+ Member</b> to add your first.
                  </EmptyState>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > perPage && (
        <div className="pagination">
          <span className="page-info">{total} members</span>
          <div className="pager">
            <button
              type="button"
              className="btn ghost"
              disabled={pageSafe <= 1}
              onClick={() => setPage(pageSafe - 1)}
            >
              Prev
            </button>
            <span className="page-info">
              Page {pageSafe} of {totalPages}
            </span>
            <button
              type="button"
              className="btn ghost"
              disabled={pageSafe >= totalPages}
              onClick={() => setPage(pageSafe + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Groups() {
  const groups = useStore((s) => s.groups);
  const members = useStore((s) => s.members);
  const removeGroup = useStore((s) => s.removeGroup);
  const removeGroupMember = useStore((s) => s.removeGroupMember);
  const { busy, run } = useSubmit();
  const [showCreate, setShowCreate] = useState(false);
  const [addTarget, setAddTarget] = useState<string | null>(null);
  const [manageTarget, setManageTarget] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  // Global "members shown per team", applied to every team card below.
  const [perTeam, setPerTeam] = useState(MEMBER_PAGE_SIZES[0]);
  const [q, setQ] = useState("");
  const [pageSize, setPageSize] = useState(10);

  const byName = (n: string) => members.find((m) => m.name === n);

  const sortOptions = useMemo(
    () => [
      ...commonSorts<Group>(
        (g) => g.name,
        (g) => g,
      ),
      countSort<Group>(
        "size",
        "Largest team",
        (g) => g.members.length,
        (g) => g.name,
      ),
    ],
    [],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("teams", sortKeys);
  const [page, setPage] = usePagedState([q, sort]);

  // Searching a team by one of its members is the point: "which team is Priya on" is
  // easier to ask than to remember.
  const shown = useMemo(
    () =>
      applySort(
        groups.filter((g) => matches(q, g.name, ...g.members)),
        sortOptions,
        sort,
      ),
    [groups, q, sortOptions, sort],
  );

  // Bounded DOM: a team card renders a row per member, so the page grew with members × teams.
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = shown.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <>
      <div className="page-head">
        <BackButton />
        <div>
          <h1>Teams</h1>
          <p>Organize your members into teams you can route tickets to.</p>
        </div>
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowCreate(true)}>
          Add team
        </Button>
      </div>

      <MasterTruncationNotice what="some teams are not shown" />

      <ListToolbar
        query={q}
        onQuery={setQ}
        placeholder="Search teams…"
        searchAriaLabel="Search teams by name or member"
        sortOptions={sortOptions}
        sort={sort}
        onSort={setSort}
        count={shown.length}
        unit="team"
        onClearAll={q ? () => setQ("") : undefined}
      />

      {shown.length === 0 && (
        <div className="card">
          <EmptyState>
            {groups.length === 0 ? (
              <>
                No teams yet — use <b>Add team</b> to create your first.
              </>
            ) : (
              <>
                No teams match <b>{q}</b>.
              </>
            )}
          </EmptyState>
        </div>
      )}

      {pageItems.map((g) => (
        <TeamCard
          key={g.name}
          group={g}
          byName={byName}
          perPage={perTeam}
          onAddMember={() => setAddTarget(g.name)}
          onManage={() => setManageTarget(g.name)}
          onRemoveMember={(member) => setConfirm({ kind: "member", group: g.name, member })}
        />
      ))}

      {shown.length > 0 && (
        <div className="card">
          <Pagination
            total={shown.length}
            page={pageSafe}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            unit="teams"
            trailing={
              <div className="page-ctl">
                <span>Members per team</span>
                <Select
                  className="plain"
                  label="Members"
                  ariaLabel="Members per team"
                  value={String(perTeam)}
                  options={MEMBER_PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
                  onChange={(v) => setPerTeam(Number(v))}
                />
              </div>
            }
          />
        </div>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} />}
      {addTarget && <AddGroupMemberModal group={addTarget} onClose={() => setAddTarget(null)} />}
      {manageTarget && (
        <EditGroupModal
          group={manageTarget}
          onClose={() => setManageTarget(null)}
          // Closes Manage before raising the confirm rather than stacking one dialog on
          // another: two modals fight over focus and Escape, and the confirm has to be the
          // thing Escape cancels.
          onDelete={() => {
            const g = manageTarget;
            setManageTarget(null);
            setConfirm({ kind: "group", group: g });
          }}
        />
      )}
      {confirm?.kind === "group" && (
        <ConfirmDialog
          title="Delete team"
          message={`Delete "${confirm.group}"? Tickets routed to this team will be left without a team.`}
          confirmLabel="Delete team"
          busy={busy}
          onConfirm={() =>
            run(() => removeGroup(confirm.group), {
              success: `Team "${confirm.group}" deleted`,
              onSuccess: () => setConfirm(null),
            })
          }
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "member" && (
        <ConfirmDialog
          title="Remove from team"
          message={`Remove ${confirm.member} from ${confirm.group}?`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={() =>
            run(() => removeGroupMember(confirm.group, confirm.member), {
              success: `${confirm.member} removed from ${confirm.group}`,
              onSuccess: () => setConfirm(null),
            })
          }
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
