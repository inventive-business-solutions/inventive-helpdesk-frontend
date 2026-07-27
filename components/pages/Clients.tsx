"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { BackButton, withOrigin } from "@/components/ui/BackButton";
import { ListToolbar } from "@/components/ui/ListToolbar";
import { MasterTruncationNotice } from "@/components/ui/TruncationNotice";
import { applySort, commonSorts, countSort, matches, useStoredSort } from "@/lib/listview";
import { Icon } from "@/components/ui/Icon";
import { ManageButton } from "@/components/ui/ManageButton";
import { StatTile } from "@/components/ui/StatTile";
import { Badge, type BadgeTone } from "@/components/ui/Chips";
import { AddClientModal } from "@/components/modals/AddClientModal";
import { AddPocModal } from "@/components/modals/AddPocModal";
import { AddDivisionModal } from "@/components/modals/AddDivisionModal";
import { EditDivisionModal } from "@/components/modals/EditDivisionModal";
import { AddClientProductModal } from "@/components/modals/AddClientProductModal";
import { ClientLeads, ClientProducts } from "@/components/pages/ClientSections";
import { EditClientModal } from "@/components/modals/EditClientModal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { useToast } from "@/components/ui/Toast";
import { useSubmit } from "@/components/ui/useSubmit";
import { RESOLVED, clientContacts, divDisplayName, enc, fmtDate, initials, isActive } from "@/lib/helpers";
import type { Client, ClientProduct, Division, Poc } from "@/types";

const PALETTE = ["var(--cat-1)", "var(--cat-2)", "var(--cat-4)", "var(--cat-3)", "var(--accent)"];

/** Onboarding lifecycle → badge tone. Churned reads as critical because it changes how
 *  every other number on the card should be read, not because it is an error. */
const STATUS_TONE: Record<Client["status"], BadgeTone> = {
  Onboarding: "info",
  Active: "good",
  "On Hold": "warning",
  Churned: "critical",
};

type Confirm =
  | { kind: "client"; client: string }
  | { kind: "division"; client: string; div: string }
  | { kind: "poc"; client: string; div: string; poc: Poc }
  | { kind: "lead"; client: string; poc: Poc }
  | { kind: "product"; client: string; product: ClientProduct };

export function Clients() {
  const router = useRouter();
  const clients = useStore((s) => s.clients);
  const tickets = useStore((s) => s.tickets);
  const removeClient = useStore((s) => s.removeClient);
  const removeDivision = useStore((s) => s.removeDivision);
  const removePoc = useStore((s) => s.removePoc);
  const removeClientProduct = useStore((s) => s.removeClientProduct);
  const invitePoc = useStore((s) => s.invitePoc);
  const toast = useToast();
  const { busy, run } = useSubmit();
  const [showAddClient, setShowAddClient] = useState(false);
  const [pocTarget, setPocTarget] = useState<{ client: string; div: string; poc?: Poc } | null>(null);
  const [divTarget, setDivTarget] = useState<string | null>(null);
  // Which division rows are expanded, keyed "client|division". Division names are only
  // unique within a client, so the client has to be part of the key or expanding Boiler at
  // one client would expand it at every other.
  const [expandedDivs, setExpandedDivs] = useState<Set<string>>(new Set());
  const [divEditTarget, setDivEditTarget] = useState<{ client: string; division: Division } | null>(null);
  const [productTarget, setProductTarget] = useState<{ client: string; product?: ClientProduct } | null>(
    null,
  );
  const [leadTarget, setLeadTarget] = useState<{ client: string; poc: Poc } | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  // Deletes that a linked ticket would block are refused up front with a clear message.
  const onDeleteClient = (name: string) => {
    const n = tickets.filter((t) => t.client === name).length;
    if (n) {
      toast(`${name} has ${n} ticket${n > 1 ? "s" : ""} — remove or reassign them first.`);
      return;
    }
    setConfirm({ kind: "client", client: name });
  };
  const onDeleteDivision = (client: string, div: string) => {
    const n = tickets.filter((t) => t.client === client && t.div === div).length;
    if (n) {
      toast(`${div} has ${n} ticket${n > 1 ? "s" : ""} — remove or reassign them first.`);
      return;
    }
    setConfirm({ kind: "division", client, div });
  };

  // Provision (or resend) a POC's portal login. Email delivery is best-effort, so
  // the toast reflects whether a sign-in mail actually went out.
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

  // Ticket counts per client, built once rather than inside the comparator — a sort makes
  // O(n log n) comparisons and re-scanning every ticket in each one would be quadratic.
  const ticketCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) if (t.client) m.set(t.client, (m.get(t.client) ?? 0) + 1);
    return m;
  }, [tickets]);

  const sortOptions = useMemo(
    () => [
      ...commonSorts<Client>(
        (c) => c.name,
        (c) => c,
      ),
      countSort<Client>(
        "tickets",
        "Most tickets",
        (c) => ticketCount.get(c.name) ?? 0,
        (c) => c.name,
      ),
    ],
    [ticketCount],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("clients", sortKeys);

  // Searching by division or contact matters as much as by company name — "which client
  // is the Boiler division" and "who is Priya with" are both asked from this page.
  const shown = useMemo(
    () =>
      applySort(
        clients.filter((c) =>
          matches(
            q,
            c.name,
            c.code,
            ...c.divisions.map((d) => d.name),
            // Not clientContacts() — that dedupes down to {id, email} and drops the
            // person's name, which is the half of a contact you actually search by.
            ...[...c.leads, ...c.divisions.flatMap((d) => d.pocs)].flatMap((p) => [p.name, p.email]),
          ),
        ),
        sortOptions,
        sort,
      ),
    [clients, q, sortOptions, sort],
  );

  // Each client renders a full card with its divisions, contacts and engagements nested
  // inside, so an unpaginated list put every one of them in the DOM at once. Search and
  // sort still run over the whole set — only what is rendered is bounded.
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = shown.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  useEffect(() => setPage(1), [q, sort]);

  return (
    <>
      <div className="page-head">
        <BackButton />
        <div>
          <h1>Clients</h1>
          <p>
            Manage client companies, the product they run, and their divisions — a division's contacts are
            managed here or in Contacts.
          </p>
        </div>
        <Button
          variant="primary"
          icon={<Icon name="plus" size={16} />}
          onClick={() => setShowAddClient(true)}
        >
          Add client
        </Button>
      </div>

      <MasterTruncationNotice what="some clients are not shown and every count here is a floor" />

      <ListToolbar
        query={q}
        onQuery={setQ}
        placeholder="Search clients…"
        searchAriaLabel="Search clients by name, code, division or contact"
        sortOptions={sortOptions}
        sort={sort}
        onSort={setSort}
        count={shown.length}
        unit="client"
        onClearAll={q ? () => setQ("") : undefined}
      />

      {shown.length === 0 && (
        <div className="card">
          <EmptyState>
            {clients.length === 0 ? (
              <>
                No clients yet — use <b>Add client</b> to onboard your first.
              </>
            ) : (
              <>
                No clients match <b>{q}</b>.
              </>
            )}
          </EmptyState>
        </div>
      )}

      {pageItems.map((cl, i) => {
        const color = PALETTE[i % PALETTE.length];
        const open = tickets.filter((t) => t.client === cl.name && isActive(t.status)).length;
        const resolved = tickets.filter((t) => t.client === cl.name && RESOLVED.includes(t.status)).length;
        // Distinct people. Summing divisions[].pocs counted a multi-division Lead once
        // per division and missed one holding none — see clientContacts.
        const pocCount = clientContacts(cl).length;
        const metrics = [
          { v: cl.divisions.length, l: "Divisions" },
          { v: pocCount, l: "Contacts" },
          { v: open, l: "Open" },
          { v: resolved, l: "Resolved" },
        ];
        return (
          <div className="card client-card" key={cl.name} style={{ ["--cc" as string]: color }}>
            <div className="cc-head">
              <span
                className="cc-logo"
                style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
              >
                {cl.code}
              </span>
              <div className="head-text">
                <div className="eyebrow">Client</div>
                <div className="cc-name" title={cl.name}>
                  {cl.name}
                </div>
                <div className="cc-sub">
                  {cl.since ? `Onboarded ${fmtDate(cl.since)}` : "No onboarding date"}
                </div>
              </div>
              <div className="cc-actions">
                {/* Products moved into their own section below — a client can run several,
                    each with its own dates, which no longer fits a single header chip. */}
                {/* "+ Division" lives with the Divisions section now, next to "+ Product"
                    with its own list — one Add button per thing you can add, where that
                    thing is. The header keeps only client-level actions. */}
                <Badge tone={STATUS_TONE[cl.status] ?? "neutral"}>{cl.status}</Badge>
                <ManageButton subject={cl.name} onClick={() => setEditClient(cl)} />
              </div>
            </div>

            <div className="cc-metrics">
              {metrics.map((m) => {
                const disabled = m.l === "Divisions" || m.l === "Contacts";
                return (
                  <StatTile
                    key={m.l}
                    value={m.v}
                    label={m.l}
                    align="center"
                    disabled={disabled}
                    onClick={
                      disabled
                        ? undefined
                        : () =>
                            // withOrigin, like the product and division links below it. This
                            // tile was the one way into Tickets from this page that did not
                            // carry it, so Back fell through to BackButton's default — the
                            // Dashboard — from a journey that started on Clients.
                            router.push(
                              withOrigin(
                                `/tickets?client=${enc(cl.name)}${m.l === "Open" ? "&active=1" : m.l === "Resolved" ? "&resolved=1" : ""}`,
                                "/clients",
                              ),
                            )
                    }
                  />
                );
              })}
            </div>

            <div className="cc-body">
              <ClientProducts
                client={cl}
                onAdd={() => setProductTarget({ client: cl.name })}
                onEdit={(p) => setProductTarget({ client: cl.name, product: p })}
                onRemove={(p) => setConfirm({ kind: "product", client: cl.name, product: p })}
                onShowTickets={(p) => {
                  // Carry the engagement's division through, so the filter bar says what the
                  // row you clicked said. Only when it names exactly ONE: none means the
                  // product is client-wide and there is no division to state, and several
                  // cannot be expressed in a single `div` param — inventing one would filter
                  // the list by something the row never claimed.
                  //
                  // divDisplayName, not the raw value: engagements store division DOCNAMES
                  // while Ticket.div holds the DISPLAY name, so passing the docname matches
                  // no ticket at all and reads as "this product has none".
                  const one = p.divisions.length === 1 ? divDisplayName(cl, p.divisions[0]) : "";
                  router.push(
                    withOrigin(
                      `/tickets?client=${enc(cl.name)}&product=${enc(p.product)}` +
                        (one ? `&div=${enc(one)}` : ""),
                      "/clients",
                    ),
                  );
                }}
              />
              <ClientLeads
                client={cl}
                onEdit={(p) => setLeadTarget({ client: cl.name, poc: p })}
                onRemove={(p) => setConfirm({ kind: "lead", client: cl.name, poc: p })}
                onInvite={onInvite}
              />
              <section className="cc-section">
                <div className="cc-section-head">
                  <span className="eyebrow">Divisions</span>
                  <Button
                    variant="ghost"
                    icon={<Icon name="plus" size={13} />}
                    onClick={() => setDivTarget(cl.name)}
                  >
                    Division
                  </Button>
                </div>
                {cl.divisions.length ? (
                  <div className="row-list">
                    {cl.divisions.map((d) => {
                      const key = `${cl.name}|${d.name}`;
                      const expanded = expandedDivs.has(key);
                      const divOpen = tickets.filter(
                        (t) => t.client === cl.name && t.div === d.name && isActive(t.status),
                      ).length;
                      return (
                        <div className="row-item div-row" key={d.name} data-open={expanded || undefined}>
                          <div className="cell-id">
                            {/* The name opens this division's tickets; POCs live behind
                                "Show details" so the list stays one line per division. */}
                            <button
                              className="dv-open"
                              title={`View ${d.name} tickets`}
                              onClick={() =>
                                router.push(
                                  withOrigin(
                                    `/tickets?client=${enc(cl.name)}&div=${enc(d.name)}`,
                                    "/clients",
                                  ),
                                )
                              }
                            >
                              <span className="dv-name">{d.name}</span>
                            </button>
                          </div>
                          <div className="cell-tag">
                            <Badge className="mono">
                              {cl.code}-{d.code}
                            </Badge>
                          </div>
                          <div className="cell-count">
                            <Badge count tone={divOpen ? "accent" : "neutral"} title={`${divOpen} open`}>
                              {divOpen || "—"}
                            </Badge>
                          </div>
                          <button
                            className="row-link cell-link"
                            aria-expanded={expanded}
                            onClick={() =>
                              setExpandedDivs((prev) => {
                                const next = new Set(prev);
                                if (next.has(key)) next.delete(key);
                                else next.add(key);
                                return next;
                              })
                            }
                          >
                            {expanded ? "Hide details" : "Show details"}
                            {/* One icon, rotated when open — there is no chevronUp, and a
                                rotation animates where an icon swap would jump. */}
                            <Icon name="chevronDown" size={12} />
                          </button>
                          <ManageButton
                            subject={d.name}
                            onClick={() => setDivEditTarget({ client: cl.name, division: d })}
                          />
                          {expanded && (
                            <div className="poc-list">
                              {d.pocs.length ? (
                                d.pocs.map((p, idx) => (
                                  <div className="poc-row" key={p.id ?? `${p.email}-${idx}`}>
                                    <span className="poc-av">{initials(p.name)}</span>
                                    <div className="poc-id">
                                      <div className="poc-name">
                                        <span className="poc-name-text">{p.name}</span>
                                        {p.isLead && (
                                          <Badge sm tone="accent">
                                            Lead
                                          </Badge>
                                        )}
                                        {p.portal === "active" && (
                                          <Badge sm tone="good">
                                            Active
                                          </Badge>
                                        )}
                                        {p.portal === "invited" && (
                                          <Badge sm tone="warning">
                                            Invited
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="poc-email">{p.email}</div>
                                    </div>
                                    <div className="poc-actions">
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
                                      <ManageButton
                                        subject={p.name}
                                        onClick={() => setPocTarget({ client: cl.name, div: d.name, poc: p })}
                                      />
                                    </div>
                                  </div>
                                ))
                              ) : (
                                <div className="poc-empty">No contact yet — add one below.</div>
                              )}
                            </div>
                          )}
                          {expanded && (
                            <button
                              className="add-poc"
                              onClick={() => setPocTarget({ client: cl.name, div: d.name })}
                            >
                              <Icon name="plus" size={13} />
                              {d.pocs.length ? "Add another contact" : "Add contact"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="div-empty">
                    No divisions yet — use <b>+ Division</b> to add one.
                  </div>
                )}
              </section>
            </div>
          </div>
        );
      })}

      {shown.length > 0 && (
        <div className="card">
          <Pagination
            total={shown.length}
            page={pageSafe}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            unit="clients"
          />
        </div>
      )}

      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
      {pocTarget && (
        <AddPocModal
          clientName={pocTarget.client}
          divName={pocTarget.div}
          poc={pocTarget.poc}
          onClose={() => setPocTarget(null)}
          onDelete={
            pocTarget.poc
              ? () => {
                  const { client, div, poc } = pocTarget;
                  setPocTarget(null);
                  if (poc) setConfirm({ kind: "poc", client, div, poc });
                }
              : undefined
          }
        />
      )}
      {leadTarget && (
        <AddPocModal
          clientName={leadTarget.client}
          divName=""
          poc={leadTarget.poc}
          onClose={() => setLeadTarget(null)}
          onDelete={() => {
            const { client, poc } = leadTarget;
            setLeadTarget(null);
            setConfirm({ kind: "lead", client, poc });
          }}
        />
      )}
      {divTarget && <AddDivisionModal clientName={divTarget} onClose={() => setDivTarget(null)} />}
      {divEditTarget && (
        <EditDivisionModal
          clientName={divEditTarget.client}
          division={divEditTarget.division}
          onClose={() => setDivEditTarget(null)}
          onDelete={() => {
            const { client, division } = divEditTarget;
            setDivEditTarget(null);
            // Keeps the guard: a division holding tickets is refused with a toast.
            onDeleteDivision(client, division.name);
          }}
        />
      )}
      {productTarget && (
        <AddClientProductModal
          clientName={productTarget.client}
          existing={productTarget.product}
          onClose={() => setProductTarget(null)}
          onDelete={
            productTarget.product
              ? () => {
                  const { client, product } = productTarget;
                  setProductTarget(null);
                  if (product) setConfirm({ kind: "product", client, product });
                }
              : undefined
          }
        />
      )}
      {editClient && (
        <EditClientModal
          client={editClient}
          onClose={() => setEditClient(null)}
          onDelete={() => {
            const target = editClient.name;
            setEditClient(null);
            // Keeps the existing guard: a client with tickets is refused with a toast
            // rather than opening a confirm that cannot succeed.
            onDeleteClient(target);
          }}
        />
      )}
      {confirm?.kind === "client" && (
        <ConfirmDialog
          title="Delete client"
          message={`Delete ${confirm.client}, along with its divisions and contacts? This can't be undone.`}
          confirmLabel="Delete client"
          busy={busy}
          onConfirm={() =>
            run(() => removeClient(confirm.client), {
              success: `${confirm.client} deleted`,
              onSuccess: () => setConfirm(null),
            })
          }
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "division" && (
        <ConfirmDialog
          title="Delete division"
          message={`Delete the ${confirm.div} division of ${confirm.client} and its contacts?`}
          confirmLabel="Delete division"
          busy={busy}
          onConfirm={() =>
            run(() => removeDivision(confirm.client, confirm.div), {
              success: `${confirm.div} deleted`,
              onSuccess: () => setConfirm(null),
            })
          }
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "lead" && (
        <ConfirmDialog
          title="Remove lead"
          message={`Remove ${confirm.poc.name} as a lead for ${confirm.client}? Their portal login is disabled unless another record still uses it.`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={() => {
            const id = confirm.poc.id;
            if (!id) return setConfirm(null);
            run(() => removePoc(id), {
              success: `${confirm.poc.name} removed`,
              onSuccess: () => setConfirm(null),
            });
          }}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "product" && (
        <ConfirmDialog
          title="Remove product"
          message={`Remove ${confirm.product.product} from ${confirm.client}? Tickets already raised are not affected.`}
          confirmLabel="Remove"
          busy={busy}
          onConfirm={() =>
            run(() => removeClientProduct(confirm.product.id), {
              success: `${confirm.product.product} removed`,
              onSuccess: () => setConfirm(null),
            })
          }
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm?.kind === "poc" && (
        <ConfirmDialog
          title="Remove contact"
          message={`Remove ${confirm.poc.name} from ${confirm.client} · ${confirm.div}?`}
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
