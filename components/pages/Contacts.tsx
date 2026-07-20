"use client";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Badge } from "@/components/ui/Chips";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Pagination } from "@/components/ui/Pagination";
import { AddPocModal } from "@/components/modals/AddPocModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useSubmit } from "@/components/ui/useSubmit";
import { initials } from "@/lib/helpers";
import type { Poc, PortalStatus } from "@/types";

// One flattened directory row — a POC plus the client/division it belongs to (both are
// display names, matching what AddPocModal / the store's divDocname() expect).
type Row = { poc: Poc; client: string; div: string };

const PORTAL_OPTS: SelectOption[] = [
  { value: "", label: "All portal states" },
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "none", label: "Not invited" },
];

// Same tone badges the Clients page uses, so a contact reads identically in both places.
function portalBadge(s?: PortalStatus) {
  if (s === "active") return <Badge tone="good">Active</Badge>;
  if (s === "invited") return <Badge tone="warning">Invited</Badge>;
  return <Badge>Not invited</Badge>;
}

export function Contacts() {
  const clients = useStore((s) => s.clients);
  const invitePoc = useStore((s) => s.invitePoc);
  const removePoc = useStore((s) => s.removePoc);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [q, setQ] = useState("");
  const [clientF, setClientF] = useState("");
  const [divF, setDivF] = useState("");
  const [portalF, setPortalF] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [pocTarget, setPocTarget] = useState<{ client: string; div: string; poc?: Poc } | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);

  // Every POC across every client/division, sorted for a stable directory order.
  const allRows = useMemo<Row[]>(
    () =>
      clients
        .flatMap((c) =>
          c.divisions.flatMap((d) => d.pocs.map((poc) => ({ poc, client: c.name, div: d.name }))),
        )
        .sort(
          (a, b) =>
            a.client.localeCompare(b.client) ||
            a.div.localeCompare(b.div) ||
            a.poc.name.localeCompare(b.poc.name),
        ),
    [clients],
  );

  const clientOpts: SelectOption[] = [
    { value: "", label: "All clients" },
    ...clients.map((c) => ({ value: c.name, label: c.name })),
  ];
  // Division filter is scoped to the chosen client (division names aren't unique across clients).
  const selectedClient = clients.find((c) => c.name === clientF);
  const divOpts: SelectOption[] = [
    { value: "", label: "All divisions" },
    ...(selectedClient?.divisions.map((d) => ({ value: d.name, label: d.name })) ?? []),
  ];

  const rows = allRows.filter((r) => {
    if (clientF && r.client !== clientF) return false;
    if (divF && r.div !== divF) return false;
    if (portalF && (r.poc.portal ?? "none") !== portalF) return false;
    if (q) {
      const s = q.toLowerCase();
      if (!r.poc.name.toLowerCase().includes(s) && !r.poc.email.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const anyFilter = !!(q || clientF || divF || portalF);
  const clearAll = () => {
    setQ("");
    setClientF("");
    setDivF("");
    setPortalF("");
  };

  // Reset to page 1 whenever the result set changes, so you never land on an empty page.
  const filterKey = `${q}|${clientF}|${divF}|${portalF}`;
  useEffect(() => setPage(1), [filterKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  // Provision (or resend) a POC's portal login — same best-effort toast as the Clients page.
  const onInvite = (p: Poc) =>
    run(async () => {
      const r = await invitePoc(p.id!);
      toast(
        r.email_sent
          ? `Sign-in email sent to ${p.email}`
          : `Portal account ready for ${p.email} — configure an email account to deliver the sign-in link`,
      );
    });

  // "Add contact" attaches to the currently-filtered client + division (a POC always needs both).
  const canAdd = !!(clientF && divF);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Contacts</h1>
          <p>
            Every client point of contact in one place — track them by client and division, and manage portal
            access.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Icon name="plus" size={16} />}
          disabled={!canAdd}
          title={canAdd ? undefined : "Pick a client and division to add a contact"}
          onClick={() => canAdd && setPocTarget({ client: clientF, div: divF })}
        >
          Add contact
        </Button>
      </div>

      <div className="contacts-toolbar">
        <div className="search">
          <Icon name="search" size={16} />
          <input
            placeholder="Search name or email…"
            aria-label="Search contacts"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select
          label="All clients"
          ariaLabel="Filter by client"
          value={clientF}
          options={clientOpts}
          onChange={(v) => {
            setClientF(v);
            setDivF(""); // divisions differ per client
          }}
        />
        <Select
          label="All divisions"
          ariaLabel="Filter by division"
          value={divF}
          options={divOpts}
          onChange={setDivF}
          disabled={!clientF}
        />
        <Select
          label="All portal states"
          ariaLabel="Filter by portal state"
          value={portalF}
          options={PORTAL_OPTS}
          onChange={setPortalF}
        />
        <div className="cf-summary">
          <span className="cf-count">
            <b>{rows.length}</b> {rows.length === 1 ? "contact" : "contacts"}
          </span>
          {anyFilter && (
            <button type="button" className="cf-clear" onClick={clearAll}>
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tk tk-contacts">
            <colgroup>
              <col style={{ width: "26%" }} /> {/* Contact */}
              <col style={{ width: "16%" }} /> {/* Client */}
              <col style={{ width: "16%" }} /> {/* Division */}
              <col style={{ width: "10%" }} /> {/* Primary */}
              <col style={{ width: "14%" }} /> {/* Portal */}
              <col style={{ width: "18%" }} /> {/* Actions */}
            </colgroup>
            <thead>
              <tr>
                <th className="left">Contact</th>
                <th className="left">Client</th>
                <th className="left">Division</th>
                <th className="center">Primary</th>
                <th className="center">Portal</th>
                <th className="center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const p = r.poc;
                return (
                  <tr key={p.id ?? `${r.client}-${r.div}-${p.email}`}>
                    <td className="t-title">
                      <div className="contact-cell">
                        <span className="poc-av">{initials(p.name)}</span>
                        <div className="contact-tx">
                          <div className="poc-name" title={p.name}>
                            {p.name}
                          </div>
                          <div className="poc-email" title={p.email}>
                            {p.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="t-cd left" title={r.client}>
                      {r.client}
                    </td>
                    <td className="t-cd left" title={r.div}>
                      {r.div}
                    </td>
                    <td className="center">
                      {p.primary ? <Badge tone="accent">Primary</Badge> : <span className="muted">—</span>}
                    </td>
                    <td className="center">{portalBadge(p.portal)}</td>
                    <td className="center">
                      <div className="row-actions">
                        {/* Fixed-width invite slot — reserved even when a POC is already active, so the
                            edit/remove icons stay aligned column-wide row-to-row. */}
                        <span className="ca-invite">
                          {p.portal !== "active" && p.id && (
                            <button
                              className="poc-invite"
                              title={
                                p.portal === "invited"
                                  ? "Resend the portal sign-in email"
                                  : "Create a portal login and email a sign-in link"
                              }
                              onClick={() => onInvite(p)}
                            >
                              {p.portal === "invited" ? "Resend" : "Invite"}
                            </button>
                          )}
                        </span>
                        <IconButton
                          icon={<Icon name="pencil" />}
                          label="Edit contact"
                          onClick={() => setPocTarget({ client: r.client, div: r.div, poc: p })}
                        />
                        <IconButton
                          tone="danger"
                          icon={<Icon name="x" />}
                          label="Remove contact"
                          onClick={() => setConfirm(r)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6}>
                    <EmptyState>
                      {anyFilter ? (
                        "No contacts match these filters."
                      ) : (
                        <>
                          No contacts yet — add one from a client's division on the <b>Clients</b> page.
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
          total={rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit="contacts"
        />
      </div>

      {pocTarget && (
        <AddPocModal
          clientName={pocTarget.client}
          divName={pocTarget.div}
          poc={pocTarget.poc}
          onClose={() => setPocTarget(null)}
        />
      )}
      {confirm && (
        <ConfirmDialog
          title="Remove contact"
          message={`Remove ${confirm.poc.name} from ${confirm.client} · ${confirm.div}? This also disables their portal login.`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={() => {
            const id = confirm.poc.id;
            if (!id) return setConfirm(null); // not yet persisted — nothing to delete
            run(() => removePoc(id), {
              success: `${confirm.poc.name} removed`,
              onSuccess: () => setConfirm(null),
            });
          }}
          onClose={() => setConfirm(null)}
        />
      )}
    </>
  );
}
