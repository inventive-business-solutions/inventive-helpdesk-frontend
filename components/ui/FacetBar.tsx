"use client";
import { useState } from "react";
import { Segmented } from "./Segmented";
import { Popover, MenuList } from "./Menu";
import { Icon } from "./Icon";
import type { Facet, ContextChip } from "@/lib/facets";

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
}: Props) {
  const [adding, setAdding] = useState(false);
  const [stage, setStage] = useState<Facet | null>(null); // chosen facet in the Add flow → show its values

  const valueOf = (f: Facet) => values[f.key] ?? "";
  const apply = (f: Facet, v: string) => (f.onPick ? f.onPick(v) : onChange(f.key, v));

  // Active pills — a `group` collapses to a single pill for its deepest set facet.
  const pills: { facet: Facet; value: string }[] = [];
  const seenGroups = new Set<string>();
  for (let i = facets.length - 1; i >= 0; i--) {
    const f = facets[i];
    const v = valueOf(f);
    if (!v) continue;
    if (f.group) {
      if (seenGroups.has(f.group)) continue;
      seenGroups.add(f.group);
    }
    pills.unshift({ facet: f, value: v });
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
        <Popover
          key={facet.group ?? facet.key}
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
                options={facet.options.map((o) => ({ ...o, selected: o.value === value }))}
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
                  options={stage.options}
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
                    label: (
                      <span className="facet-opt">
                        {f.icon && (
                          <span className="facet-opt-ic">
                            <Icon name={f.icon} size={14} />
                          </span>
                        )}
                        <span className="facet-opt-tx">{f.label}</span>
                      </span>
                    ),
                  }))}
                  onSelect={(k) => setStage(addable.find((f) => f.key === k) ?? null)}
                />
              </>
            )
          }
        </Popover>
      )}

      {(pills.length > 0 || count != null) && (
        <div className="facet-summary">
          {count != null && (
            <span className="fs-count">
              <b>{count}</b> {count === 1 ? unit : `${unit}s`}
            </span>
          )}
          {pills.length > 0 && (
            <button type="button" className="fs-clear" onClick={onClearAll}>
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
