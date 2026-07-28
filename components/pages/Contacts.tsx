"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { BackButton } from "@/components/ui/BackButton";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { MasterTruncationNotice } from "@/components/ui/TruncationNotice";
import { applySort, byName, commonSorts, useStoredSort } from "@/lib/listview";
import { usePagedState } from "@/lib/usePagedState";
import { Icon } from "@/components/ui/Icon";
import { ManageButton } from "@/components/ui/ManageButton";
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
  const [pageSize, setPageSize] = useState(10);

  const [pocTarget, setPocTarget] = useState<{ client: string; div: string; poc?: Poc } | null>(null);
  const [confirm, setConfirm] = useState<Row | null>(null);

  // Every POC across every client/division, sorted for a stable directory order.
  //
  // A contact holding several divisions appears once per division — that is what the
  // Division column is for. But a Lead holding NONE appeared nowhere at all: they exist,
  // the Clients page shows them, and this directory silently omitted them, so the one
  // place you would go to find and fix an unassigned contact was the one place that hid
  // them. They are listed here with an empty division.
  const allRows = useMemo<Row[]>(
    () =>
      clients
        .flatMap((c) => [
          ...c.divisions.flatMap((d) => d.pocs.map((poc) => ({ poc, client: c.name, div: d.name }))),
          ...c.leads.filter((l) => !l.divisions.length).map((poc) => ({ poc, client: c.name, div: "" })),
        ])
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

  // A contact holding several divisions appears once per division, so the same person can
  // occupy several rows. Sorting therefore always falls through to client then division,
  // which keeps one person's rows adjacent instead of scattering them through the table.
  const sortOptions = useMemo(
    () => [
      ...commonSorts<Row>(
        (r) => r.poc.name,
        (r) => r.poc,
      ),
      {
        key: "client",
        label: "Client",
        compare: (a: Row, b: Row) =>
          byName(a.client, b.client) || byName(a.div, b.div) || byName(a.poc.name, b.poc.name),
      },
    ],
    [],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("contacts", sortKeys);

  // Memoised: this runs over every contact row, and without it a modal opening or a
  // pagination click re-filtered and re-sorted the whole directory for no reason.
  const rows = useMemo(() => {
    const filtered = allRows.filter((r) => {
      if (clientF && r.client !== clientF) return false;
      if (divF && r.div !== divF) return false;
      if (portalF && (r.poc.portal ?? "none") !== portalF) return false;
      if (q) {
        const needle = q.toLowerCase();
        if (!r.poc.name.toLowerCase().includes(needle) && !r.poc.email.toLowerCase().includes(needle))
          return false;
      }
      return true;
    });
    return applySort(filtered, sortOptions, sort);
  }, [allRows, clientF, divF, portalF, q, sortOptions, sort]);

  const anyFilter = !!(q || clientF || divF || portalF);
  const clearAll = () => {
    setQ("");
    setClientF("");
    setDivF("");
    setPortalF("");
  };

  // Reset to page 1 whenever the result set changes, so you never land on an empty page.
  const filterKey = `${q}|${clientF}|${divF}|${portalF}|${sort}`;
  const [page, setPage] = usePagedState([filterKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  // Provision (or resend) a POC's portal login — same best-effort toast as the Clients page.
  const onInvite = (p: Poc) => {
    // Narrow rather than assert: the Invite button only renders when p.id is set, so
    // this cannot fire without one — but the `!` hid that invariant, and the delete paths
    // in this same file already guard the identical case explicitly.
    const id = p.id;
    if (!id) return;
    run(async () => {
      const r = await invitePoc(id);
      toast(
        r.email_sent
          ? `Sign-in email sent to ${p.email}`
          : `Portal account ready for ${p.email} — configure an email account to deliver the sign-in link`,
      );
    });
  };

  // The dialog asks for the client and division itself, so this no longer depends on having
  // filtered to both first. It used to sit disabled on arrival with a tooltip telling you to
  // go and set two filters before you could add anybody — the one action the page exists for,
  // gated behind unrelated controls. Active filters still seed the dialog, so filtering to a
  // division and adding someone there is unchanged.
  //
  // The one real precondition is a client to attach to: a contact is scoped by its client,
  // and none can exist before one does.
  const canAdd = clients.length > 0;

  return (
    <>
      <div className="page-head">
        <BackButton />
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
          title={canAdd ? undefined : "Add a client first — a contact belongs to one"}
          onClick={() => canAdd && setPocTarget({ client: clientF, div: divF })}
        >
          Add contact
        </Button>
      </div>

      <MasterTruncationNotice what="some contacts are not shown" />

      <ListToolbar
        query={q}
        onQuery={setQ}
        placeholder="Search contacts…"
        searchAriaLabel="Search contacts by name or email"
        sortOptions={sortOptions}
        sort={sort}
        onSort={setSort}
        count={rows.length}
        unit="contact"
        onClearAll={anyFilter ? clearAll : undefined}
        filters={
          <>
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
          </>
        }
      />

      <div className="card">
        <div className="table-wrap">
          <table className="tk tk-contacts">
            <colgroup>
              <col style={{ width: "27%" }} />
              {/* Contact */}
              <col style={{ width: "16%" }} />
              {/* Client */}
              <col style={{ width: "16%" }} />
              {/* Division */}
              <col style={{ width: "10%" }} />
              {/* Role */}
              <col style={{ width: "15%" }} />
              {/* Portal — 15% keeps the 96px badge inside its cell down to ~773px */}
              <col style={{ width: "16%" }} />
              {/* Actions — one 108px Manage button now, not two controls; 16% holds it
                  down to ~800px, where it used to need 18% of 1122px */}
            </colgroup>
            <thead>
              <tr>
                <th className="left">Contact</th>
                <th className="left">Client</th>
                <th className="left">Division</th>
                <th className="center">Role</th>
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
                    {/* An unassigned Lead has no division and no ticket access — say so
                        rather than leaving the cell blank, which reads as a rendering fault. */}
                    <td className="t-cd left" title={r.div || "No division assigned yet"}>
                      {r.div || <span className="muted">No division</span>}
                    </td>
                    <td className="center">
                      {p.isLead ? <Badge tone="accent">Lead</Badge> : <span className="muted">Contact</span>}
                    </td>
                    <td className="center">{portalBadge(p.portal)}</td>
                    <td className="center">
                      {/* Manage only. Invite/resend moved into that dialog: the slot here was
                          a fixed 68px reserved on EVERY row — including active contacts who
                          can never use it — purely to keep the icons aligned. Two controls
                          made Actions the widest column in the table and the reason it
                          scrolled. The dialog also has room to say what the action does. */}
                      <div className="row-actions">
                        <ManageButton
                          subject={p.name}
                          onClick={() => setPocTarget({ client: r.client, div: r.div, poc: p })}
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
          onDelete={
            pocTarget.poc
              ? () => {
                  const t = pocTarget;
                  setPocTarget(null);
                  if (t.poc) setConfirm({ poc: t.poc, client: t.client, div: t.div });
                }
              : undefined
          }
          // Only for a saved contact: invitePoc needs an id, and one being added has none
          // until it is created (where the "Invite to the client portal" tick covers it).
          onInvite={pocTarget.poc?.id ? () => onInvite(pocTarget.poc!) : undefined}
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
