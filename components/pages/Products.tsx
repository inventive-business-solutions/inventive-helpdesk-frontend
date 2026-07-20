"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../../store";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";
import { IconButton } from "../ui/IconButton";
import { Segmented } from "../ui/Segmented";
import { StatTile } from "../ui/StatTile";
import { Badge } from "../ui/Chips";
import { EmptyState } from "../ui/EmptyState";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AddProductModal } from "../modals/AddProductModal";
import { EditProductModal } from "../modals/EditProductModal";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { RESOLVED, enc, isActive } from "../../lib/helpers";
import type { Client } from "../../types";

const PALETTE = ["var(--cat-1)", "var(--cat-2)", "var(--cat-3)", "var(--cat-4)", "var(--accent)"];

export function Products() {
  const router = useRouter();
  const clients = useStore((s) => s.clients);
  const tickets = useStore((s) => s.tickets);
  const products = useStore((s) => s.products);
  const setProduct = useStore((s) => s.setProduct);
  const deleteProduct = useStore((s) => s.deleteProduct);
  const toast = useToast();
  const { busy, run } = useSubmit();

  const [tab, setTab] = useState<"assigned" | "unassigned">("assigned");
  const [showAdd, setShowAdd] = useState(false);
  const [assignTarget, setAssignTarget] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [unassignTarget, setUnassignTarget] = useState<{ product: string; client: string } | null>(null);

  // Group clients by the product they run — a product can be run by several.
  const clientsByProduct = new Map<string, Client[]>();
  for (const c of clients) {
    if (!c.product) continue;
    const arr = clientsByProduct.get(c.product) ?? [];
    arr.push(c);
    clientsByProduct.set(c.product, arr);
  }
  const assigned = products.filter((p) => clientsByProduct.has(p));
  const unassigned = products.filter((p) => !clientsByProduct.has(p));

  // A product still assigned to a client can't be deleted (Frappe blocks removing a
  // linked doc) — steer the admin to unassign it everywhere first.
  const onDeleteProduct = (product: string) => {
    const running = clientsByProduct.get(product) ?? [];
    if (running.length) {
      toast(
        `${product} is run by ${running.length} client${running.length > 1 ? "s" : ""} — unassign it everywhere first.`,
      );
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
            const names = new Set(runningClients.map((c) => c.name));
            const scoped = tickets.filter((t) => names.has(t.client));
            const open = scoped.filter((t) => isActive(t.status)).length;
            const resolved = scoped.filter((t) => RESOLVED.includes(t.status)).length;
            const divCount = runningClients.reduce((n, c) => n + c.divisions.length, 0);
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
                    <IconButton
                      size="sm"
                      icon={<Icon name="pencil" />}
                      label="Edit product & assignment"
                      onClick={() => setRenameTarget(product)}
                    />
                    <IconButton
                      size="sm"
                      tone="danger"
                      icon={<Icon name="x" />}
                      label="Delete product"
                      onClick={() => onDeleteProduct(product)}
                    />
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
                    return (
                      <div className="pdiv" key={cl.name}>
                        <div className="pdiv-top">
                          <span className="pdiv-name">{cl.name}</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <span className="pdiv-code mono">{cl.code}</span>
                            <IconButton
                              size="sm"
                              tone="danger"
                              icon={<Icon name="x" />}
                              label={`Unassign ${product} from ${cl.name}`}
                              onClick={() => setUnassignTarget({ product, client: cl.name })}
                            />
                          </span>
                        </div>
                        {cl.divisions.length ? (
                          <div className="pdiv-divs">
                            <div className="pdd-head eyebrow">
                              <span>Division</span>
                              <span>Open</span>
                            </div>
                            {cl.divisions.map((d) => {
                              const dOpen = tickets.filter(
                                (t) => t.client === cl.name && t.div === d.name && isActive(t.status),
                              ).length;
                              return (
                                <button
                                  className="pdd"
                                  key={d.name}
                                  title={`${dOpen} active ticket${dOpen === 1 ? "" : "s"} — open ${cl.name} · ${d.name}`}
                                  onClick={() =>
                                    router.push(
                                      `/tickets?product=${enc(product)}&client=${enc(cl.name)}&div=${enc(d.name)}`,
                                    )
                                  }
                                >
                                  <span className="pdd-name">{d.name}</span>
                                  <Badge count tone={dOpen ? "accent" : "neutral"} className="pdd-count">
                                    {dOpen || "—"}
                                  </Badge>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="pdiv-empty">No divisions yet</div>
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
                    <IconButton
                      size="sm"
                      icon={<Icon name="pencil" />}
                      label="Rename product"
                      onClick={() => setRenameTarget(product)}
                    />
                    <IconButton
                      size="sm"
                      tone="danger"
                      icon={<Icon name="x" />}
                      label="Delete product"
                      onClick={() => onDeleteProduct(product)}
                    />
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
      {assignTarget && <AddProductModal presetName={assignTarget} onClose={() => setAssignTarget(null)} />}
      {renameTarget && <EditProductModal product={renameTarget} onClose={() => setRenameTarget(null)} />}
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
          message={`Remove ${unassignTarget.product} from ${unassignTarget.client}? The client will have no product until you assign one.`}
          confirmLabel="Unassign"
          busy={busy}
          onConfirm={() =>
            run(() => setProduct(unassignTarget.client, ""), {
              success: `${unassignTarget.product} unassigned from ${unassignTarget.client}`,
              onSuccess: () => setUnassignTarget(null),
            })
          }
          onClose={() => setUnassignTarget(null)}
        />
      )}
    </>
  );
}
