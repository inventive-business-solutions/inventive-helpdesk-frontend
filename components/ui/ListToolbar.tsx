"use client";
import type { ReactNode } from "react";
import { SearchInput } from "./SearchInput";
import { TopbarSlot } from "@/components/layout/TopbarSlot";
import { SortMenu } from "./SortMenu";
import type { SortOption } from "@/lib/listview";

/**
 * The strip above every master-data list: section-specific filters on the left, the result
 * count and sort control on the right. The search box is not here — it is portalled into
 * the topbar's centre, so it holds one position across every section.
 *
 * Generalised from the toolbar the Contacts page already had, so all five lists present
 * the same control in the same place instead of Contacts having filters and the rest
 * having nothing.
 */
export function ListToolbar<T>({
  query,
  onQuery,
  placeholder,
  searchAriaLabel,
  sortOptions,
  sort,
  onSort,
  count,
  unit,
  filters,
  onClearAll,
  actions,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  /** Fuller description for assistive tech, when the page searches more than its own
   *  entity. The placeholder names the section (consistently, across every list); this
   *  says what the box actually matches on. */
  searchAriaLabel?: string;
  sortOptions: SortOption<T>[];
  sort: string;
  onSort: (key: string) => void;
  /** Rows after filtering — shown so a narrowed list says how much it narrowed to. Omit
   *  where the page already states the total elsewhere (Products has tab badges). */
  count?: number;
  /** Singular noun; pluralised with a trailing "s". */
  unit: string;
  /** Section-specific controls (the client/division/portal selects on Contacts). */
  filters?: ReactNode;
  /** Shown only when something is actually filtered, so it is never a dead button. */
  onClearAll?: () => void;
  /** Trailing action, e.g. "Add client". */
  actions?: ReactNode;
}) {
  return (
    <div className="list-toolbar">
      {filters}
      {/* Portalled out of this row into the topbar, so it starts at the same x on every
          section instead of wherever the row's other contents happen to leave it. Renders
          no box here, so the row below is filters-left, count/sort-right. */}
      <TopbarSlot>
        <SearchInput value={query} onChange={onQuery} placeholder={placeholder} ariaLabel={searchAriaLabel} />
      </TopbarSlot>
      <div className="lt-right">
        {count != null && (
          <span className="lt-count">
            <b>{count}</b> {count === 1 ? unit : `${unit}s`}
          </span>
        )}
        {onClearAll && (
          <button type="button" className="lt-clear" onClick={onClearAll}>
            Clear all
          </button>
        )}
        <SortMenu options={sortOptions} value={sort} onChange={onSort} />
        {actions}
      </div>
    </div>
  );
}
