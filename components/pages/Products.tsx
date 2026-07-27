"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "../../store";
import { Button } from "../ui/Button";
import { BackButton, withOrigin } from "../ui/BackButton";
import { ListToolbar } from "../ui/ListToolbar";
import { MasterTruncationNotice } from "../ui/TruncationNotice";
import { applySort, commonSorts, countSort, matches, useStoredSort } from "../../lib/listview";
import { Icon } from "../ui/Icon";
import { ManageButton } from "../ui/ManageButton";
import { Segmented } from "../ui/Segmented";
import { StatTile } from "../ui/StatTile";
import { Badge } from "../ui/Chips";
import { EmptyState } from "../ui/EmptyState";
import { Pagination } from "../ui/Pagination";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { AddProductModal } from "../modals/AddProductModal";
import { AddClientProductModal } from "../modals/AddClientProductModal";
import { EditProductModal } from "../modals/EditProductModal";
import { useToast } from "../ui/Toast";
import { useSubmit } from "../ui/useSubmit";
import { RESOLVED, divDisplayName, enc, isActive, plural } from "../../lib/helpers";
import type { Client, ClientProduct, Product } from "../../types";

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
  // Carries the engagement id: Remove now detaches the one record you were editing, not
  // every engagement the client happens to hold for this product.
  const [unassignTarget, setUnassignTarget] = useState<{
    product: string;
    client: string;
    engId: string;
  } | null>(null);
  const [engTarget, setEngTarget] = useState<{ client: string; eng: ClientProduct } | null>(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Group clients by the products they run. Driven by `client.products` — the Client
  // Product engagements — which is the same source the client card and the portal read.
  // It used to read the legacy `Client.product` single Link, so anything added from the
  // Clients page simply never appeared here.
  // Memoised, not rebuilt inline each render: the sort and search below both close over
  // it, and a map with a fresh identity every render defeats their memoisation entirely.
  const clientsByProduct = useMemo(() => {
    const m = new Map<string, Client[]>();
    for (const c of clients) {
      for (const name of new Set(c.products.map((p) => p.product))) {
        const arr = m.get(name) ?? [];
        arr.push(c);
        m.set(name, arr);
      }
    }
    return m;
  }, [clients]);

  const sortOptions = useMemo(
    () => [
      ...commonSorts<Product>(
        (p) => p.name,
        (p) => p,
      ),
      countSort<Product>(
        "clients",
        "Most clients",
        (p) => clientsByProduct.get(p.name)?.length ?? 0,
        (p) => p.name,
      ),
    ],
    [clientsByProduct],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("products", sortKeys);

  // Search matches the product name or any client running it, so "who runs Helpdesk" and
  // "what does Thermax run" are both answerable from this one box.
  const visible = useMemo(
    () =>
      products.filter((p) => matches(q, p.name, ...(clientsByProduct.get(p.name) ?? []).map((c) => c.name))),
    [products, clientsByProduct, q],
  );
  const assigned = useMemo(
    () =>
      applySort(
        visible.filter((p) => clientsByProduct.has(p.name)),
        sortOptions,
        sort,
      ),
    [visible, clientsByProduct, sortOptions, sort],
  );
  const unassigned = useMemo(
    () =>
      applySort(
        visible.filter((p) => !clientsByProduct.has(p.name)),
        sortOptions,
        sort,
      ),
    [visible, clientsByProduct, sortOptions, sort],
  );

  // A product card renders a block per client and a row per division inside each, so the
  // assigned tab grew with engagements, not just with products. Paginated per tab, since
  // the two are independent lists that happen to share a page.
  const inTab = tab === "assigned" ? assigned : unassigned;
  const totalPages = Math.max(1, Math.ceil(inTab.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = inTab.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);
  useEffect(() => setPage(1), [q, sort, tab]);

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

  // Tickets pin a product in place for good — the history has to keep making sense — so
  // this is a different answer from "unassign it first", and saying which one applies is
  // the whole point. Counted from the tickets already loaded; delete_product re-checks
  // server-side and is the authority. This only decides what to offer.
  const ticketsByProduct = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tickets) if (t.product) m.set(t.product, (m.get(t.product) ?? 0) + 1);
    return m;
  }, [tickets]);

  // Two different refusals, and they used to be one. A product with no engagements went
  // straight to the confirm dialog and then failed on the server — for a while naming a
  // client the page showed no link to at all, because the legacy `Client.product` field
  // was still holding it. That field is gone; this keeps the page and the server saying
  // the same thing rather than the page guessing a narrower rule.
  const onDeleteProduct = (product: string) => {
    const running = clientsByProduct.get(product) ?? [];
    if (running.length) {
      toast(`${product} is run by ${plural(running.length, "client")} — unassign it everywhere first.`);
      return;
    }
    const onTickets = ticketsByProduct.get(product) ?? 0;
    if (onTickets) {
      toast(
        `${product} is on ${plural(onTickets, "ticket")} and has to stay for that history to make sense.`,
      );
      return;
    }
    setDeleteTarget(product);
  };

  return (
    <>
      <div className="page-head">
        <BackButton />
        <div>
          <h1>Products</h1>
          <p>The products Inventive supports and the clients that run them.</p>
        </div>
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowAdd(true)}>
          Add product
        </Button>
      </div>

      <MasterTruncationNotice what="some products are not shown" />

      {/* Search and sort first, matching every other list page — this page put its tabs
          above the toolbar and so read differently from Clients, Contacts, Members and
          Teams for no reason. The tabs sit under it as a full-width band, which also stops
          two short pills floating in an otherwise empty row.

          No count on the toolbar: the tabs below carry both totals, and a third number
          saying the same thing is noise. */}
      <ListToolbar
        query={q}
        onQuery={setQ}
        placeholder="Search products…"
        searchAriaLabel="Search products by name, or by a client that runs one"
        sortOptions={sortOptions}
        sort={sort}
        onSort={setSort}
        unit="product"
        onClearAll={q ? () => setQ("") : undefined}
      />

      <Segmented
        className="products-tabs"
        fullWidth
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
          pageItems.map((prod, i) => {
            // Products carry timestamps now so the list can sort by them; everything below
            // works on the name, so unwrap it once here rather than at thirty call sites.
            const product = prod.name;
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
                  onClick={() => router.push(withOrigin(`/tickets?product=${enc(product)}`, "/products"))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(withOrigin(`/tickets?product=${enc(product)}`, "/products"));
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
                              // Accent, not neutral: this says the product covers the whole
                              // client, which is the widest scope — a grey chip made it read
                              // as the absence of one.
                              <Badge sm tone="accent" title={`${product} covers all of ${cl.name}`}>
                                Client-wide
                              </Badge>
                            )}
                            <span className="pdiv-code mono">{cl.code}</span>
                            {/* No Manage here. Editing an engagement lives behind the product's
                                own Manage at the top of this card, alongside renaming and
                                deleting — one entry point for "change something about this
                                product" instead of two buttons a card apart, neither saying
                                which of the two things it acted on. */}
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
                                      withOrigin(
                                        `/tickets?product=${enc(product)}&client=${enc(cl.name)}&div=${enc(dName)}`,
                                        "/products",
                                      ),
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
          pageItems.map((prod, i) => {
            const product = prod.name;
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
                  {/* One control, matching the assigned cards. Assigning lives inside Manage
                      alongside renaming, deleting and editing an engagement — a second button
                      here offered a subset of what the first one already does. */}
                  <div className="product-actions">
                    <ManageButton subject={product} onClick={() => setRenameTarget(product)} />
                  </div>
                </div>
                <div className="uprod-empty">
                  <Icon name="info" size={15} />
                  <span>
                    Not yet run by any client — so it has no divisions, contacts or tickets. Assign it to a
                    client and those appear here, exactly like the other products.
                  </span>
                </div>
              </div>
            );
          })
        ))}

      {inTab.length > 0 && (
        <div className="card">
          <Pagination
            total={inTab.length}
            page={pageSafe}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            unit="products"
          />
        </div>
      )}

      {showAdd && <AddProductModal onClose={() => setShowAdd(false)} />}
      {/* Same dialog the client card uses, so an engagement created here is identical to
          one created there — dates, divisions and all. */}
      {assignTarget && (
        <AddClientProductModal presetProduct={assignTarget} onClose={() => setAssignTarget(null)} />
      )}

      {/* The engagement editor, reached from a client row's Manage. Same dialog the Clients
          page uses, so dates and division scoping are editable from either side rather than
          only from the client card. */}
      {engTarget && (
        <AddClientProductModal
          clientName={engTarget.client}
          existing={engTarget.eng}
          onClose={() => setEngTarget(null)}
          onDelete={() => {
            setUnassignTarget({
              product: engTarget.eng.product,
              client: engTarget.client,
              engId: engTarget.eng.id,
            });
            setEngTarget(null);
          }}
        />
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
          // Hand off rather than stack: nested modals fight over focus and Escape, and both
          // of these are full forms. Closing this one first is the same pattern the delete
          // path above already uses.
          onEditEngagement={(client, eng) => {
            setRenameTarget(null);
            setEngTarget({ client, eng });
          }}
          onAssign={() => {
            const target = renameTarget;
            setRenameTarget(null);
            setAssignTarget(target);
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
              // Just this engagement. The card renders a Manage per engagement, so the one
              // you opened is the one that goes — removing the client's others alongside it
              // would delete records you were not looking at.
              () => removeClientProduct(unassignTarget.engId),
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
