"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
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
import { useToast } from "@/components/ui/Toast";
import { useSubmit } from "@/components/ui/useSubmit";
import { RESOLVED, enc, fmtDate, initials, isActive } from "@/lib/helpers";
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
  const [divEditTarget, setDivEditTarget] = useState<{ client: string; division: Division } | null>(null);
  const [productTarget, setProductTarget] = useState<{ client: string; product?: ClientProduct } | null>(
    null,
  );
  const [leadTarget, setLeadTarget] = useState<{ client: string; poc: Poc } | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
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

  return (
    <>
      <div className="page-head">
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

      {clients.map((cl, i) => {
        const color = PALETTE[i % PALETTE.length];
        const open = tickets.filter((t) => t.client === cl.name && isActive(t.status)).length;
        const resolved = tickets.filter((t) => t.client === cl.name && RESOLVED.includes(t.status)).length;
        const pocCount = cl.divisions.reduce((n, d) => n + d.pocs.length, 0);
        const metrics = [
          { v: cl.divisions.length, l: "Divisions" },
          { v: pocCount, l: "POCs" },
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
                <Badge tone={STATUS_TONE[cl.status] ?? "neutral"}>{cl.status}</Badge>
                <Button
                  variant="ghost"
                  icon={<Icon name="plus" size={14} />}
                  onClick={() => setDivTarget(cl.name)}
                >
                  Division
                </Button>
                <IconButton
                  size="sm"
                  icon={<Icon name="pencil" />}
                  label="Edit client"
                  onClick={() => setEditClient(cl)}
                />
                <IconButton
                  size="sm"
                  tone="danger"
                  icon={<Icon name="x" />}
                  label="Delete client"
                  onClick={() => onDeleteClient(cl.name)}
                />
              </div>
            </div>

            <div className="cc-metrics">
              {metrics.map((m) => {
                const disabled = m.l === "Divisions" || m.l === "POCs";
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
                            router.push(
                              `/tickets?client=${enc(cl.name)}${m.l === "Open" ? "&active=1" : m.l === "Resolved" ? "&resolved=1" : ""}`,
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
              />
              <ClientLeads
                client={cl}
                onEdit={(p) => setLeadTarget({ client: cl.name, poc: p })}
                onRemove={(p) => setConfirm({ kind: "lead", client: cl.name, poc: p })}
                onInvite={onInvite}
              />
              {cl.divisions.length ? (
                <div className="div-grid">
                  {cl.divisions.map((d) => (
                    <div
                      className="div-card"
                      key={d.name}
                      role="button"
                      tabIndex={0}
                      title={`View ${d.name} tickets`}
                      // The card opens its division's tickets. Nested controls call
                      // stopPropagation, so this only fires on the card's own surface —
                      // clicking Edit must not also navigate away from the dialog it opens.
                      onClick={() => router.push(`/tickets?client=${enc(cl.name)}&div=${enc(d.name)}`)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(`/tickets?client=${enc(cl.name)}&div=${enc(d.name)}`);
                        }
                      }}
                    >
                      <div className="dv-head">
                        <span className="dv-name">{d.name}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <Badge className="mono">
                            {cl.code}-{d.code}
                          </Badge>
                          <IconButton
                            size="sm"
                            icon={<Icon name="pencil" />}
                            label="Edit division"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDivEditTarget({ client: cl.name, division: d });
                            }}
                          />
                          <IconButton
                            size="sm"
                            tone="danger"
                            icon={<Icon name="x" />}
                            label="Delete division"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteDivision(cl.name, d.name);
                            }}
                          />
                        </span>
                      </div>
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
                                <IconButton
                                  size="sm"
                                  icon={<Icon name="pencil" />}
                                  label="Edit POC"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPocTarget({ client: cl.name, div: d.name, poc: p });
                                  }}
                                />
                                <IconButton
                                  size="sm"
                                  tone="danger"
                                  icon={<Icon name="x" />}
                                  label="Remove POC"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirm({ kind: "poc", client: cl.name, div: d.name, poc: p });
                                  }}
                                />
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="poc-empty">No POC yet — add one below.</div>
                        )}
                      </div>
                      <button
                        className="add-poc"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPocTarget({ client: cl.name, div: d.name });
                        }}
                      >
                        <Icon name="plus" size={13} />
                        {d.pocs.length ? "Add another POC" : "Add POC"}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="div-empty">
                  No divisions yet — use <b>+ Division</b> above to add one.
                </div>
              )}
            </div>
          </div>
        );
      })}

      {showAddClient && <AddClientModal onClose={() => setShowAddClient(false)} />}
      {pocTarget && (
        <AddPocModal
          clientName={pocTarget.client}
          divName={pocTarget.div}
          poc={pocTarget.poc}
          onClose={() => setPocTarget(null)}
        />
      )}
      {leadTarget && (
        <AddPocModal
          clientName={leadTarget.client}
          divName=""
          poc={leadTarget.poc}
          onClose={() => setLeadTarget(null)}
        />
      )}
      {divTarget && <AddDivisionModal clientName={divTarget} onClose={() => setDivTarget(null)} />}
      {divEditTarget && (
        <EditDivisionModal
          clientName={divEditTarget.client}
          division={divEditTarget.division}
          onClose={() => setDivEditTarget(null)}
        />
      )}
      {productTarget && (
        <AddClientProductModal
          clientName={productTarget.client}
          existing={productTarget.product}
          onClose={() => setProductTarget(null)}
        />
      )}
      {editClient && <EditClientModal client={editClient} onClose={() => setEditClient(null)} />}
      {confirm?.kind === "client" && (
        <ConfirmDialog
          title="Delete client"
          message={`Delete ${confirm.client}, along with its divisions and POCs? This can't be undone.`}
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
          message={`Delete the ${confirm.div} division of ${confirm.client} and its POCs?`}
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
          title="Remove POC"
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
