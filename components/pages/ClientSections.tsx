"use client";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ManageButton } from "@/components/ui/ManageButton";
import { Badge } from "@/components/ui/Chips";
import { fmtDate, initials } from "@/lib/helpers";
import type { Client, ClientProduct, Poc } from "@/types";

/** How many division chips to show before collapsing the rest into "+N".
 *  A lead on twelve divisions must not make its row taller than the card. */
const CHIP_LIMIT = 3;

/** Division chips, capped. `names` are display names, already resolved.
 *  `limit` is lower inside a row list, where the chips sit in a fixed-width column and
 *  wrapping would make one row taller than its neighbours. */
function DivisionChips({
  names,
  empty,
  limit = CHIP_LIMIT,
}: {
  names: string[];
  empty: string;
  limit?: number;
}) {
  if (!names.length) return <span className="chip-empty">{empty}</span>;
  const shown = names.slice(0, limit);
  const rest = names.length - shown.length;
  return (
    <span className="chip-group">
      {shown.map((n) => (
        <span className="chip" key={n} title={n}>
          {n}
        </span>
      ))}
      {rest > 0 && (
        // Full list in the tooltip so nothing is unreachable once collapsed.
        <span className="chip chip-more" title={names.join(", ")}>
          +{rest}
        </span>
      )}
    </span>
  );
}

/** Resolve division docnames to display names for one client. */
function divNames(client: Client, docnames: string[]) {
  return docnames.map((dn) => client.divisions.find((d) => d.docname === dn)?.name ?? dn);
}

export function ClientProducts({
  client,
  openCount,
  onAdd,
  onEdit,
  onRemove,
  onShowTickets,
}: {
  client: Client;
  /** Open tickets tagged with this product, for this client. */
  openCount: (product: string) => number;
  onAdd: () => void;
  onEdit: (p: ClientProduct) => void;
  onRemove: (p: ClientProduct) => void;
  onShowTickets: (p: ClientProduct) => void;
}) {
  return (
    <section className="cc-section">
      <div className="cc-section-head">
        <span className="eyebrow">Products</span>
        <Button variant="ghost" icon={<Icon name="plus" size={13} />} onClick={onAdd}>
          Product
        </Button>
      </div>
      {client.products.length ? (
        <div className="row-list">
          {client.products.map((p) => {
            const open = openCount(p.product);
            return (
              // The row opens this product's tickets on click, but deliberately carries no
              // role="button"/tabIndex: it contains real buttons, and interactive elements
              // must not nest. "Show tickets" inside it IS the accessible control — it is
              // focusable, announced, and does the same thing.
              <div
                className="row-item prod-row"
                key={p.id}
                title={`View ${p.product} tickets`}
                onClick={() => onShowTickets(p)}
              >
                <div className="cell-id">
                  <span className="prod-ic">
                    <Icon name="box" size={14} />
                  </span>
                  <div className="prod-id">
                    <div className="prod-name" title={p.product}>
                      {p.product}
                    </div>
                    <div className="prod-meta">
                      {p.devStart && <span>Start {fmtDate(p.devStart)}</span>}
                      {p.expectedCompletion && <span>Due {fmtDate(p.expectedCompletion)}</span>}
                      {!p.devStart && !p.expectedCompletion && <span>No dates set</span>}
                    </div>
                  </div>
                </div>
                <div className="cell-tag">
                  <DivisionChips names={divNames(client, p.divisions)} empty="Client-wide" limit={2} />
                </div>
                <div className="cell-count">
                  <Badge count tone={open ? "accent" : "neutral"} title={`${open} open`}>
                    {open || "—"}
                  </Badge>
                </div>
                <button
                  className="row-link cell-link"
                  onClick={(e) => {
                    e.stopPropagation();
                    onShowTickets(p);
                  }}
                >
                  Show tickets
                </button>
                <ManageButton subject={p.product} onClick={() => onEdit(p)} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="div-empty">
          No products yet — use <b>+ Product</b> to add one.
        </div>
      )}
    </section>
  );
}

export function ClientLeads({
  client,
  onEdit,
  onRemove,
  onInvite,
}: {
  client: Client;
  onEdit: (p: Poc) => void;
  onRemove: (p: Poc) => void;
  onInvite: (p: Poc) => void;
}) {
  if (!client.leads.length) return null;
  return (
    <section className="cc-section">
      <div className="cc-section-head">
        <span className="eyebrow">Client leads</span>
      </div>
      <div className="poc-list">
        {client.leads.map((p, idx) => (
          <div className="poc-row" key={p.id ?? `${p.email}-${idx}`}>
            <span className="poc-av">{initials(p.name)}</span>
            <div className="poc-id">
              <div className="poc-name">
                <span className="poc-name-text">{p.name}</span>
                <Badge sm tone="accent">
                  Lead
                </Badge>
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
              <div className="poc-email" title={p.email}>
                {p.email}
                {p.phone ? ` · ${p.phone}` : ""}
              </div>
            </div>
            {/* A lead with no divisions can sign in but sees nothing, which looks broken
                unless the page says so. This is the only place that state is visible. */}
            <DivisionChips names={divNames(client, p.divisions)} empty="No access yet" />
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
              <ManageButton subject={p.name} onClick={() => onEdit(p)} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
