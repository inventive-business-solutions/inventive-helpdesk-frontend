"use client";
import { Popover, MenuList } from "./Menu";
import { Icon } from "./Icon";
import type { SortOption } from "@/lib/listview";

/**
 * The sort control for a list toolbar. Built on the same Popover + MenuList as FacetBar
 * so it reads as one family with the ticket filter pills rather than a second, unrelated
 * dropdown idiom.
 *
 * Generic over the row type so each page passes comparators for its own entity; this
 * component only ever touches `key` and `label`.
 */
export function SortMenu<T>({
  options,
  value,
  onChange,
}: {
  options: SortOption<T>[];
  value: string;
  onChange: (key: string) => void;
}) {
  // A stored sort we no longer offer falls back to the first option's LABEL rather than
  // rendering blank, so the control always states what order you are actually looking at.
  const current = options.find((o) => o.key === value) ?? options[0];
  if (!current) return null;

  return (
    <Popover
      ariaLabel="Change sort order"
      minWidth={200}
      trigger={({ ref, onClick, open }) => (
        <button type="button" ref={ref} onClick={onClick} className={`sort-btn ${open ? "open" : ""}`.trim()}>
          <Icon name="sort" size={14} className="sort-ic" />
          <span className="sk">Sort</span>
          <span className="sv">{current.label}</span>
          <Icon name="chevronDown" size={12} className="sort-caret" />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <div className="facet-menu-head">
            <Icon name="sort" size={13} />
            Sort by
          </div>
          <MenuList
            options={options.map((o) => ({
              value: o.key,
              label: o.label,
              selected: o.key === current.key,
            }))}
            onSelect={(k) => {
              onChange(k);
              close();
            }}
          />
        </>
      )}
    </Popover>
  );
}
