"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { Modal } from "@/components/ui/Modal";
import { ModalFooter } from "@/components/ui/ModalFooter";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
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
import { TIER } from "@/lib/tiers";

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
  const sendInvite = useStore((s) => s.sendInvite);
  const members = useStore((s) => s.members);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [rows, setRows] = useState<api.AdminRow[] | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ row: api.AdminRow; next: boolean } | null>(null);
  // Candidates are fetched only when the picker opens: the list is only interesting at the
  // moment you are adding someone, and it goes stale the instant you promote one.
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<api.AdminRow[] | null>(null);
  const [picked, setPicked] = useState("");

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

  const openPicker = async () => {
    setPicked("");
    setCandidates(null);
    setAdding(true);
    try {
      setCandidates(await api.adminCandidates());
    } catch (err) {
      toast(api.userFacingMessage(err) ?? "Couldn't load the list of members.");
      setAdding(false);
    }
  };

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

  // Team Member rows with no live account. `status` is the app's own view of that, and it
  // is what decides whether the button offers a first invite or a resend.
  const pendingInvites = useMemo(() => members.filter((m) => m.status !== "Active"), [members]);

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
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => void openPicker()}>
          Add {TIER.admin}
        </Button>
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
                <th className="center">{TIER.admin}</th>
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
                  ? `${TIER.owner} — not managed here`
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
                        <Badge tone="accent">{TIER.owner}</Badge>
                      ) : r.is_admin ? (
                        <Badge tone="good">{TIER.admin}</Badge>
                      ) : (
                        <Badge>{TIER.agent}</Badge>
                      )}
                    </td>
                    <td className="center">
                      {locked ? (
                        <span className="muted" title={why}>
                          —
                        </span>
                      ) : (
                        <label
                          className="check-row admin-toggle"
                          title={`Toggle ${TIER.admin} access for ${r.member_name}`}
                        >
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
                        <>
                          Only you can manage this organisation. Use <b>Add {TIER.admin}</b> to share it.
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
      </div>

      <div className="auth-note">
        <Icon name="info" size={14} />
        <div>
          A {TIER.admin} can manage every client, contact, product, member and team — the same as you, except
          this page. Only a {TIER.owner} can grant or revoke it, so access cannot spread on its own.
        </div>
      </div>

      {adding && (
        <Modal
          title={`Add ${TIER.admin}`}
          onClose={() => setAdding(false)}
          onSubmit={(e) => {
            e.preventDefault();
            const row = (candidates ?? []).find((c) => c.name === picked);
            if (!row) return toast("Choose a member to promote");
            setAdding(false);
            setConfirm({ row, next: true });
          }}
          footer={
            <ModalFooter
              submitLabel={`Grant ${TIER.admin}`}
              busyLabel="Saving…"
              busy={busy}
              submitDisabled={!picked}
              onCancel={() => setAdding(false)}
            />
          }
        >
          <div className="modal-body">
            <Field label="Team member" required>
              {(id) => (
                <Select
                  id={id}
                  block
                  label={candidates === null ? "Loading…" : "Select a member"}
                  ariaLabel="Team member"
                  value={picked}
                  disabled={!candidates?.length}
                  options={(candidates ?? []).map((c) => ({
                    value: c.name,
                    label: c.title ? `${c.member_name} — ${c.title}` : c.member_name,
                  }))}
                  onChange={setPicked}
                />
              )}
            </Field>

            {candidates !== null && candidates.length === 0 && (
              <div className="field-hint">
                Everyone with an account already has access. Someone who has not accepted their invite cannot
                be promoted yet — invite them below first.
              </div>
            )}

            {/* Invite is here because "add an administrator" and "that person has never
                signed in" are the same moment in practice: without an account there is no
                user to hold the role, and the endpoint refuses. Sending it from here saves
                a trip to Members and back. */}
            {pendingInvites.length > 0 && (
              <div className="field">
                <div className="field-label">Not yet signed in</div>
                <div className="eng-list">
                  {pendingInvites.map((m) => (
                    <div className="eng-row" key={m.name}>
                      <div className="eng-main">
                        <span className="eng-client">{m.name}</span>
                        <span className="eng-scope">{m.email}</span>
                      </div>
                      <Button
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          run(() => sendInvite(m.name), {
                            success: `Invite sent to ${m.email}`,
                          })
                        }
                      >
                        {m.status === "Invited" ? "Resend invite" : "Send invite"}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.next ? `Grant ${TIER.admin} access` : `Revoke ${TIER.admin} access`}
          message={
            confirm.next
              ? `${confirm.row.member_name} will be able to manage every client, contact, product, member and team. They will not be able to grant it to anyone else.`
              : `${confirm.row.member_name} will go back to working tickets only, and will lose access to clients, contacts, products, members and teams.`
          }
          confirmLabel={confirm.next ? `Grant ${TIER.admin}` : `Revoke ${TIER.admin}`}
          busy={busy}
          onConfirm={() => apply(confirm.row, confirm.next)}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
