"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { BackButton } from "@/components/ui/BackButton";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { applySort, commonSorts, matches, useStoredSort } from "@/lib/listview";
import { Badge } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useSubmit } from "@/components/ui/useSubmit";
import { initials } from "@/lib/helpers";
import * as api from "@/lib/frappe";

/**
 * Delegate admin access to a team member.
 *
 * Owner-only, and the server says so independently — `list_admins` and `set_member_admin`
 * both refuse anyone below that tier, so this page hides a section that would be refused
 * anyway rather than being the thing that protects it.
 *
 * A delegated admin gets the full manager surface (clients, contacts, products, members,
 * teams) but cannot reach this page, so admin never spreads on its own.
 */
export function Admin() {
  const session = useStore((s) => s.session);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [rows, setRows] = useState<api.AdminRow[] | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ row: api.AdminRow; next: boolean } | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.listAdmins());
    } catch (err) {
      toast(api.userFacingMessage(err) ?? "Couldn't load the team list.");
      setRows([]);
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const sortOptions = useMemo(
    () => [
      ...commonSorts<api.AdminRow>(
        (r) => r.member_name,
        () => ({}),
      ),
    ],
    [],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("admin", sortKeys, "az");

  const shown = useMemo(
    () =>
      applySort(
        (rows ?? []).filter((r) => matches(q, r.member_name, r.email, r.title)),
        sortOptions,
        sort,
      ),
    [rows, q, sortOptions, sort],
  );

  const apply = (row: api.AdminRow, next: boolean) =>
    run(() => api.setMemberAdmin(row.name, next), {
      success: `${row.member_name} ${next ? "can now manage the organisation" : "no longer has admin access"}`,
      onSuccess: () => {
        setConfirm(null);
        void load();
      },
    });

  return (
    <>
      <div className="page-head">
        <BackButton />
        <div>
          <h1>Admin</h1>
          <p>
            Give a team member the run of the organisation — clients, contacts, products, members and teams.
            They will not be able to grant it to anyone else.
          </p>
        </div>
      </div>

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
          <table className="tk">
            <thead>
              <tr>
                <th className="left">Name</th>
                <th className="left">Email</th>
                <th className="center">Access</th>
                <th className="center">Admin</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const isSelf = r.user === session?.user;
                // Owners are not managed here, and neither is your own access — both are
                // routes to a site nobody can administer. The server refuses either way;
                // this explains why rather than presenting a control that fails.
                const locked = r.is_owner || isSelf || !r.can_delegate;
                const why = r.is_owner
                  ? "Site owner — not managed here"
                  : isSelf
                    ? "You can't change your own access"
                    : !r.can_delegate
                      ? "Hasn't accepted their invite yet"
                      : "";
                return (
                  <tr key={r.name}>
                    <td className="t-title">
                      <span className="row-av">{initials(r.member_name)}</span>
                      {r.member_name}
                    </td>
                    <td className="t-cd left">{r.email}</td>
                    <td className="center">
                      {r.is_owner ? (
                        <Badge tone="accent">Owner</Badge>
                      ) : r.is_admin ? (
                        <Badge tone="good">Admin</Badge>
                      ) : (
                        <Badge>Agent</Badge>
                      )}
                    </td>
                    <td className="center">
                      {locked ? (
                        <span className="muted" title={why}>
                          —
                        </span>
                      ) : (
                        <label className="check-row admin-toggle" title={`Toggle admin for ${r.member_name}`}>
                          <input
                            type="checkbox"
                            checked={r.is_admin}
                            disabled={busy}
                            onChange={() => setConfirm({ row: r, next: !r.is_admin })}
                          />
                        </label>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows !== null && shown.length === 0 && (
                <tr>
                  <td colSpan={4}>
                    <EmptyState>
                      {(rows ?? []).length === 0 ? (
                        <>No team members yet — add one from Members.</>
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
      </div>

      <div className="auth-note">
        <Icon name="info" size={14} />
        <div>
          An admin can manage every client, contact, product, member and team — the same as you, except this
          page. Only a site owner can grant or revoke it, so admin cannot spread on its own.
        </div>
      </div>

      {confirm && (
        <ConfirmDialog
          title={confirm.next ? "Grant admin access" : "Revoke admin access"}
          message={
            confirm.next
              ? `${confirm.row.member_name} will be able to manage every client, contact, product, member and team. They will not be able to grant admin to anyone else.`
              : `${confirm.row.member_name} will go back to working tickets only, and will lose access to clients, contacts, products, members and teams.`
          }
          confirmLabel={confirm.next ? "Grant admin" : "Revoke admin"}
          busy={busy}
          onConfirm={() => apply(confirm.row, confirm.next)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
