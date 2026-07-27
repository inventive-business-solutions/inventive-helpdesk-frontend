"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { Modal } from "@/components/ui/Modal";
import { ModalFooter } from "@/components/ui/ModalFooter";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { Field, TextField } from "@/components/ui/Field";
import { BackButton } from "@/components/ui/BackButton";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { applySort, commonSorts, matches, useStoredSort } from "@/lib/listview";
import { Badge } from "@/components/ui/Chips";
import { ManageButton } from "@/components/ui/ManageButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/Icon";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useSubmit } from "@/components/ui/useSubmit";
import { initials, isEmail } from "@/lib/helpers";
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
  const updateMember = useStore((s) => s.updateMember);
  const members = useStore((s) => s.members);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [rows, setRows] = useState<api.AdminRow[] | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ row: api.AdminRow; next: boolean } | null>(null);
  const [managing, setManaging] = useState<api.AdminRow | null>(null);
  // Candidates are fetched only when the picker opens: the list is only interesting at the
  // moment you are adding someone, and it goes stale the instant you promote one.
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<api.AdminRow[] | null>(null);
  const [picked, setPicked] = useState("");
  // An administrator need not be an agent — the person running the org may never work a
  // ticket — so the dialog can create one outright rather than requiring them to be on
  // the team first.
  const [freshName, setFreshName] = useState("");
  const [freshEmail, setFreshEmail] = useState("");

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
                <th className="center">Manage</th>
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
                        <span className="muted">{why}</span>
                      ) : (
                        <ManageButton subject={r.member_name} onClick={() => setManaging(r)} />
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

            <div className="field">
              <div className="field-label">Or invite someone new</div>
              <div className="field-hint">
                They do not need to be on a team — they will be emailed a set-password link and arrive as an{" "}
                {TIER.admin}.
              </div>
              <div className="field-2">
                <TextField
                  label="Full name"
                  value={freshName}
                  placeholder="e.g. P. Deshmukh"
                  onChange={setFreshName}
                />
                <TextField
                  label="Email"
                  type="email"
                  value={freshEmail}
                  placeholder="name@company.com"
                  onChange={setFreshEmail}
                />
              </div>
              <Button
                variant="ghost"
                disabled={busy || !freshName.trim() || !isEmail(freshEmail)}
                onClick={() =>
                  run(() => api.inviteAdmin(freshName.trim(), freshEmail.trim()), {
                    success: `Invite sent to ${freshEmail.trim()}`,
                    onSuccess: () => {
                      setFreshName("");
                      setFreshEmail("");
                      setAdding(false);
                      void load();
                    },
                  })
                }
              >
                <Icon name="mail" size={14} />
                Invite as {TIER.admin}
              </Button>
            </div>

            {/* Existing members who have never signed in: without an account there is no
                user to hold the role, so the endpoint refuses them. Resending from here
                saves a trip to Members and back. */}
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

      {managing && (
        <ManageAdminModal
          row={managing}
          busy={busy}
          onClose={() => setManaging(null)}
          onSaveName={(name, title) =>
            // The store action, not a raw call: a name change goes through the backend
            // rename, which cascades the assignee/member Link references on tickets and
            // teams. A direct field write would leave those pointing at the old name.
            run(() => updateMember(managing.name, { name, title }), {
              success: `${name} updated`,
              onSuccess: () => {
                setManaging(null);
                void load();
              },
            })
          }
          onRevoke={() => {
            const row = managing;
            setManaging(null);
            setConfirm({ row, next: false });
          }}
        />
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

/** The manage view for one administrator: correct their name, or take their access away.
 *
 *  Both live behind one control because they are the two things you come to this row to
 *  do, and a bare checkbox said neither — it offered exactly one of them, unlabelled, and
 *  took effect on a mis-click. Revoking hands back to the page's confirm step rather than
 *  acting here, so the consequence is spelled out before anything happens. */
function ManageAdminModal({
  row,
  busy,
  onClose,
  onSaveName,
  onRevoke,
}: {
  row: api.AdminRow;
  busy: boolean;
  onClose: () => void;
  onSaveName: (name: string, title: string) => void;
  onRevoke: () => void;
}) {
  const [name, setName] = useState(row.member_name);
  const [title, setTitle] = useState(row.title ?? "");
  const [err, setErr] = useState(false);
  const dirty = name.trim() !== row.member_name || title.trim() !== (row.title ?? "");

  return (
    <Modal
      title={`Manage ${row.member_name}`}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        if (!name.trim()) return setErr(true);
        onSaveName(name.trim(), title.trim());
      }}
      footer={
        <ModalFooter
          submitLabel="Save changes"
          busyLabel="Saving…"
          busy={busy}
          submitDisabled={!dirty}
          onCancel={onClose}
          left={
            <Button variant="ghost" danger onClick={onRevoke} disabled={busy}>
              Remove {TIER.admin} access
            </Button>
          }
        />
      }
    >
      <div className="modal-body">
        <TextField
          label="Full name"
          required
          value={name}
          error={err}
          autoFocus
          onChange={(v) => {
            setName(v);
            if (err) setErr(false);
          }}
        />
        <TextField
          label="Job title"
          optional
          value={title}
          placeholder="e.g. Operations Lead"
          onChange={setTitle}
        />
        <Field label="Email">{() => <input value={row.email} readOnly />}</Field>
        <div className="auth-note">
          <Icon name="info" size={14} />
          <div>
            Email is how they sign in, so it is changed from <b>Members</b> rather than here. Removing access
            leaves the person on the team — they go back to working tickets only.
          </div>
        </div>
      </div>
    </Modal>
  );
}
