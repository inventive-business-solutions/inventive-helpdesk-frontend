"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../../store";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { ManageButton } from "../ui/ManageButton";
import { Segmented } from "../ui/Segmented";
import { StatTile } from "../ui/StatTile";
import { Badge } from "../ui/Chips";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AddProductModal } from "../modals/AddProductModal";
import { AddClientProductModal } from "../modals/AddClientProductModal";
import { EditProductModal } from "../modals/EditProductModal";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { RESOLVED, divDisplayName, enc, isActive, plural } from "../../lib/helpers";
import type { Client } from "../../types";

const PALETTE = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--accent)"];

export function Products() {
  const router = useRouter();
  const clients = useStore((s) => s.clients);
  const tickets = useStore((s) => s.tickets);
  const products = useStore((s) => s.products);
  const removeClientProduct = useStore((s) => s.removeClientProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [tab, setTab] = useState<"assigned" | "unassigned">("assigned");
  const [showAdd, setShowAdd] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [unassignTarget, setUnassignTarget] = useState<{ product: string; client: string } | null>(null);

  // Group clients by the products they run. Driven by `client.products` — the Client
  // Product engagements — which is the same source the client card and the portal read.
  // It used to read the legacy `Client.product` single Link, so anything added from the
  // Clients page simply never appeared here.
  const clientsByProduct = new Map<string, Client[]>();
  for (const c of clients) {
    for (const name of new Set(c.products.map((p) => p.product))) {
      const arr = clientsByProduct.get(name) ?? [];
      arr.push(c);
      clientsByProduct.set(name, arr);
    }
  }
  const assigned = products.filter((p) => clientsByProduct.has(p));
  const unassigned = products.filter((p) => !clientsByProduct.has(p));

  /** The engagements one client holds for this product, and the divisions they cover.
   *  An engagement with no divisions covers the client as a whole, so it contributes
   *  every division the client has. */
  const engagementsFor = (cl: Client, product: string) => {
    const engs = cl.products.filter((p) => p.product === product);
    const clientWide = engs.some((e) => !e.divisions.length);
    const covered = clientWide
      ? cl.divisions.map((d) => d.name)
      : [...new Set(engs.flatMap((e) => e.divisions.map((dn) => divDisplayName(cl, dn))))];
    return { engs, clientWide, covered };
  };

  // A product still attached to a client can't be deleted (Frappe blocks removing a
  // linked doc) — steer the admin to unassign it everywhere first.
  const onDeleteProduct = (product: string) => {
    const running = clientsByProduct.get(product) ?? [];
    if (running.length) {
      toast(`${product} is run by ${plural(running.length, "client")} — unassign it everywhere first.`);
      return;
    }
    setDeleteTarget(product);
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Products</h1>
          <p>The products Inventive supports and the clients that run them.</p>
        </div>
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowAdd(true)}>
          Add product
        </Button>
      </div>

      <Segmented
        className="products-tabs"
        options={[
          { key: "assigned", label: "Assigned", count: assigned.length },
          { key: "unassigned", label: "Unassigned", count: unassigned.length },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "assigned" &&
        (assigned.length === 0 ? (
          <div className="card">
            <EmptyState>
              No products assigned to a client yet — add one with <b>Add product</b>, or assign an existing
              product from the Unassigned tab.
            </EmptyState>
          </div>
        ) : (
          assigned.map((product, i) => {
            const color = PALETTE[i % PALETTE.length];
            const runningClients = clientsByProduct.get(product) ?? [];
            // Counted from the ticket's own product field. This used to infer scope from
            // client + division, which could not tell two products in one division apart —
            // the ticket now says which one it is about.
            const scoped = tickets.filter((t) => t.product === product);
            const open = scoped.filter((t) => isActive(t.status)).length;
            const resolved = scoped.filter((t) => RESOLVED.includes(t.status)).length;
            const divCount = runningClients.reduce(
              (n, c) => n + engagementsFor(c, product).covered.length,
              0,
            );
            const stats = [
              { v: open, l: "Open" },
              { v: resolved, l: "Resolved" },
              { v: scoped.length, l: "Total" },
              { v: divCount, l: divCount === 1 ? "Division" : "Divisions" },
              { v: runningClients.length, l: runningClients.length === 1 ? "Client" : "Clients" },
            ];
            return (
              <div className="card product-card" key={product} style={{ ["--cc" as string]: color }}>
                <div className="product-head">
                  <span
                    className="product-badge"
                    style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
                  >
                    <Icon name="box" size={24} />
                  </span>
                  <div className="head-text">
                    <div className="eyebrow">Product</div>
                    <div className="product-name">{product}</div>
                  </div>
                  <div className="product-actions">
                    <Badge
                      round
                      className="used-by"
                      title={`Run by ${runningClients.map((c) => c.name).join(", ")}`}
                    >
                      <Icon name="clients" size={13} />
                      <span className="clip">Used by {runningClients.map((c) => c.name).join(", ")}</span>
                    </Badge>
                    <ManageButton subject={product} onClick={() => setRenameTarget(product)} />
                  </div>
                </div>

                <div
                  className="product-stats"
                  role="link"
                  tabIndex={0}
                  title={`View tickets for ${product}`}
                  onClick={() => router.push(`/tickets?product=${enc(product)}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/tickets?product=${enc(product)}`);
                    }
                  }}
                >
                  {stats.map((s) => (
                    <StatTile key={s.l} value={s.v} label={s.l} align="center" />
                  ))}
                </div>

                <div className="product-divs">
                  {runningClients.map((cl) => {
                    // Only the divisions THIS engagement covers. Listing every division the
                    // client has implied the product ran everywhere, which is exactly what
                    // the divisions on an engagement exist to contradict.
                    const { clientWide, covered } = engagementsFor(cl, product);
                    return (
                      <div className="pdiv" key={cl.name}>
                        <div className="pdiv-top">
                          <span className="pdiv-name">{cl.name}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            {clientWide && (
                              <Badge sm title={`${product} covers all of ${cl.name}`}>
                                Client-wide
                              </Badge>
                            )}
                            <span className="pdiv-code mono">{cl.code}</span>
                            {/* One action today, but the same trigger as every other row —
                                a bare ✕ here would be the only unlabelled destructive
                                control left, and it sits next to a client name. */}
                            <ManageButton
                              subject={`${product} at ${cl.name}`}
                              onClick={() => setUnassignTarget({ product, client: cl.name })}
                            />
                          </span>
                        </div>
                        {covered.length ? (
                          <div className="pdiv-divs">
                            <div className="pdd-head eyebrow">
                              <span>Division</span>
                              <span>Open</span>
                            </div>
                            {covered.map((dName) => {
                              const dOpen = tickets.filter(
                                (t) => t.client === cl.name && t.div === dName && isActive(t.status),
                              ).length;
                              return (
                                <button
                                  className="pdd"
                                  key={dName}
                                  title={`${plural(dOpen, "active ticket")} — open ${cl.name} · ${dName}`}
                                  onClick={() =>
                                    router.push(
                                      `/tickets?product=${enc(product)}&client=${enc(cl.name)}&div=${enc(dName)}`,
                                    )
                                  }
                                >
                                  <span className="pdd-name">{dName}</span>
                                  <Badge count tone={dOpen ? "accent" : "neutral"} className="pdd-count">
                                    {dOpen || "—"}
                                  </Badge>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="pdiv-empty">
                            {clientWide ? "Runs client-wide — no divisions yet" : "No divisions yet"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        ))}

      {tab === "unassigned" &&
        (unassigned.length === 0 ? (
          <div className="card">
            <EmptyState>No unassigned products — every product is being run by a client.</EmptyState>
          </div>
        ) : (
          unassigned.map((product, i) => {
            const color = PALETTE[i % PALETTE.length];
            return (
              <div className="card product-card" key={product} style={{ ["--cc" as string]: color }}>
                <div className="product-head">
                  <span
                    className="product-badge"
                    style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
                  >
                    <Icon name="box" size={24} />
                  </span>
                  <div className="head-text">
                    <div className="eyebrow">Product</div>
                    <div className="product-name">{product}</div>
                  </div>
                  <div className="product-actions">
                    <Button variant="ghost" onClick={() => setAssignTarget(product)}>
                      Assign to a client
                    </Button>
                    <ManageButton subject={product} onClick={() => setRenameTarget(product)} />
                  </div>
                </div>
                <div className="uprod-empty">
                  <Icon name="info" size={15} />
                  <span>
                    Not yet run by any client — so it has no divisions, POCs or tickets. Assign it to a client
                    and those appear here, exactly like the other products.
                  </span>
                </div>
              </div>
            );
          })
        ))}

      {showAdd && <AddProductModal onClose={() => setShowAdd(false)} />}
      {/* Same dialog the client card uses, so an engagement created here is identical to
          one created there — dates, divisions and all. */}
      {assignTarget && (
        <AddClientProductModal presetProduct={assignTarget} onClose={() => setAssignTarget(null)} />
      )}
      {renameTarget && (
        <EditProductModal
          product={renameTarget}
          onClose={() => setRenameTarget(null)}
          onDelete={() => {
            const target = renameTarget;
            setRenameTarget(null);
            onDeleteProduct(target);
          }}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete product"
          message={`Delete ${deleteTarget}? This can't be undone.`}
          confirmLabel="Delete product"
          busy={busy}
          onConfirm={() =>
            run(() => deleteProduct(deleteTarget), {
              success: `${deleteTarget} deleted`,
              onSuccess: () => setDeleteTarget(null),
            })
          }
          onClose={() => setDeleteTarget(null)}
        />
      )}
      {unassignTarget && (
        <ConfirmDialog
          title="Unassign product"
          message={`Remove ${unassignTarget.product} from ${unassignTarget.client}? Its dates and division scoping are removed with it. Tickets already raised are not affected.`}
          confirmLabel="Unassign"
          busy={busy}
          onConfirm={() =>
            run(
              async () => {
                // A client can hold several engagements of one product (different
                // divisions), so unassigning removes every one of them — otherwise the
                // product would stay on the card via the engagements left behind.
                const cl = clients.find((c) => c.name === unassignTarget.client);
                for (const eng of cl?.products.filter((p) => p.product === unassignTarget.product) ?? []) {
                  await removeClientProduct(eng.id);
                }
              },
              {
                success: `${unassignTarget.product} unassigned from ${unassignTarget.client}`,
                onSuccess: () => setUnassignTarget(null),
              },
            )
          }
          onClose={() => setUnassignTarget(null)}
        />
      )}
    </>
  );
}
