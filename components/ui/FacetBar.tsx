"use client";
import { useState, type ReactNode } from "react";
import { Segmented } from "./Segmented";
import { Popover, MenuList } from "./Menu";
import { Icon } from "./Icon";
import type { Facet, ContextChip } from "@/lib/facets";
import type { IconName } from "./Icon";

/**
 * One option row, for EVERY level of these menus.
 *
 * The first level of "Add filter" built its rows as an icon box plus a label; the level you
 * drill into, and each pill's own menu, passed their options straight through as bare
 * strings. So the same menu changed typography and lost its left alignment the moment you
 * went one level deeper — it read as a different component rather than the same one drilled
 * into.
 *
 * A facet's VALUES have no icons of their own (`Facet.options` is `SelectOption[]`), and
 * repeating the facet's icon down every row would just be noise — the header already carries
 * it. So a row without an icon reserves the column instead of collapsing it, and text stays
 * on one vertical line however deep the menu goes.
 */
function facetOption(label: ReactNode, icon?: IconName): ReactNode {
  return (
    <span className="facet-opt">
      <span className={`facet-opt-ic ${icon ? "" : "blank"}`.trim()} aria-hidden="true">
        {icon && <Icon name={icon} size={14} />}
      </span>
      <span className="facet-opt-tx">{label}</span>
    </span>
  );
}

interface BucketConfig {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}

interface Props {
  /** Leading status bucket (Segmented). Omit for the client portal (KPIs are its bucket). */
  bucket?: BucketConfig;
  /** Non-editable scope/view chips (a clear-only ✕ shows when `onRemove` is set). */
  context?: ContextChip[];
  /** The dimensions valid for this role + section (from buildFacets). */
  facets: Facet[];
  /** Current value per facet key ("" = unset). */
  values: Record<string, string>;
  /** Set a facet's value (cascade facets bypass this via Facet.onPick). */
  onChange: (key: string, value: string) => void;
  /** Clear a facet — receives the key plus any cascade children (clearKeys). */
  onClear: (keys: string[]) => void;
  /** Clear everything the user can clear (adapter preserves locked scope). */
  onClearAll: () => void;
  count?: number;
  unit?: string;
  /** Trailing control in the right-hand group, after the count and "Clear all" — the sort
   *  menu. Tickets used to put its sort on a row of its own above this bar, which meant the
   *  one control every list shares sat somewhere different here than on the ListToolbar
   *  pages. Same slot, same order (count → clear → sort) in both now. */
  trailing?: ReactNode;
}

export function FacetBar({
  bucket,
  context = [],
  facets,
  values,
  onChange,
  onClear,
  onClearAll,
  count,
  unit = "ticket",
  trailing,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState<Facet | null>(null); // chosen facet in the Add flow → show its values

  const valueOf = (f: Facet) => values[f.key] ?? "";
  const apply = (f: Facet, v: string) => (f.onPick ? f.onPick(v) : onChange(f.key, v));

  // One pill per ACTIVE filter. Grouped facets used to collapse to their deepest set
  // level, which meant a filter could narrow the list with nothing on screen to say so.
  //
  // Arriving from a client card's product link (/tickets?client=X&product=Z) set both, and
  // the loop — walking backwards, keeping the first hit per group — kept Client and dropped
  // Product. The list was filtered by a product the bar never mentioned and offered no way
  // to remove.
  //
  // The collapse assumed containment: show the deepest and the ancestors are implied. That
  // holds for client -> div -> poc, but product is not in that chain (a client runs several
  // products, a product runs at several clients) — onProductPick KEEPS a compatible client
  // rather than replacing it, which is what an intersecting filter does, not a parent. And
  // even within the chain it was lossy: division names are not unique across clients (see
  // clientsWithDiv), so "Division: Heating" alone does not say whose.
  //
  // `group` is still used, for the Popover key below.
  const pills: { facet: Facet; value: string }[] = [];
  for (const f of facets) {
    const v = valueOf(f);
    if (v) pills.push({ facet: f, value: v });
  }

  // "+ Add filter" offers any facet with no value (grouped ones: any empty level → drill).
  const addable = facets.filter((f) => !valueOf(f));

  return (
    <div className="facet-bar">
      {bucket && (
        <Segmented
          role="group"
          ariaLabel={bucket.ariaLabel ?? "View"}
          options={bucket.options.map((o) => ({ key: o.key, label: o.label }))}
          value={bucket.value}
          onChange={bucket.onChange}
        />
      )}

      {context.map((c) => (
        <span className="facet-context" key={c.key}>
          {c.label && <span className="fk">{c.label}</span>}
          <span className="fv">{c.value}</span>
          {c.onRemove && (
            <button
              type="button"
              className="fs-token-x"
              aria-label={`Remove ${c.label ?? ""} ${c.value}`}
              onClick={c.onRemove}
            >
              <Icon name="x" size={11} strokeWidth={2.5} />
            </button>
          )}
        </span>
      ))}

      {pills.map(({ facet, value }) => (
        // facet.key, not facet.group: several facets share a group, and now that each
        // renders its own pill a group key would repeat across siblings.
        <Popover
          key={facet.key}
          ariaLabel={`Change ${facet.label}`}
          minWidth={190}
          trigger={({ ref, onClick, open }) => (
            <span className={`facet-pill ${open ? "open" : ""}`.trim()}>
              <button type="button" ref={ref} onClick={onClick} className="facet-pill-main">
                {facet.icon && <Icon name={facet.icon} size={13} className="facet-pill-ic" />}
                <span className="fk">{facet.label}</span>
                <span className="fv">{facet.formatValue ? facet.formatValue(value) : value}</span>
                <Icon name="chevronDown" size={12} className="facet-pill-caret" />
              </button>
              <button
                type="button"
                className="fs-token-x"
                aria-label={`Remove ${facet.label} filter`}
                onClick={() => onClear([facet.key, ...(facet.clearKeys ?? [])])}
              >
                <Icon name="x" size={11} strokeWidth={2.5} />
              </button>
            </span>
          )}
        >
          {({ close }) => (
            <>
              <div className="facet-menu-head">
                {facet.icon && <Icon name={facet.icon} size={13} />}
                {facet.label}
              </div>
              <MenuList
                options={facet.options.map((o) => ({
                  ...o,
                  label: facetOption(o.label),
                  selected: o.value === value,
                }))}
                onSelect={(v) => {
                  apply(facet, v);
                  close();
                }}
              />
            </>
          )}
        </Popover>
      ))}

      {addable.length > 0 && (
        <Popover
          ariaLabel="Add a filter"
          minWidth={180}
          open={adding}
          onOpenChange={(o) => {
            setAdding(o);
            if (!o) setStage(null);
          }}
          trigger={({ ref, onClick }) => (
            <button type="button" ref={ref} onClick={onClick} className="facet-add">
              <Icon name="plus" size={13} strokeWidth={2.4} />
              Add filter
            </button>
          )}
        >
          {({ close }) =>
            stage ? (
              <>
                <button type="button" className="facet-menu-back" onClick={() => setStage(null)}>
                  <Icon name="arrowLeft" size={13} />
                  {stage.icon && <Icon name={stage.icon} size={13} />}
                  {stage.label}
                </button>
                <MenuList
                  options={stage.options.map((o) => ({ ...o, label: facetOption(o.label) }))}
                  onSelect={(v) => {
                    apply(stage, v);
                    setStage(null);
                    close();
                  }}
                />
              </>
            ) : (
              <>
                <div className="facet-menu-head">
                  <Icon name="plus" size={12} strokeWidth={2.4} />
                  Filter by
                </div>
                <MenuList
                  options={addable.map((f) => ({
                    value: f.key,
                    label: facetOption(f.label, f.icon),
                  }))}
                  onSelect={(k) => setStage(addable.find((f) => f.key === k) ?? null)}
                />
              </>
            )
          }
        </Popover>
      )}

      {(pills.length > 0 || count != null || trailing) && (
        <div className="facet-summary">
          {count != null && (
            <span className="fs-count">
              <b>{count}</b> {count === 1 ? unit : `${unit}s`}
            </span>
          )}
          {/* Context chips count too, not just pills. A dashboard funnel (`?attention=1`,
              `?sla=1`) or a global search arrives as a context chip with NO pill, so this
              used to hide "Clear all" in exactly the case where it is most needed: the bar
              reads "All", the list is filtered to a subset, and the only way out is an
              11px ✕. Reported from production as "filter isn't clearing" — the bucket does
              not own these predicates, so nothing else in the bar could clear them. */}
          {(pills.length > 0 || context.some((c) => c.onRemove)) && (
            <button type="button" className="fs-clear" onClick={onClearAll}>
              Clear all
            </button>
          )}
          {trailing}
        </div>
      )}
    </div>
  );
}
