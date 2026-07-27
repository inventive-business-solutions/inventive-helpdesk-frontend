"use client";
import type { ReactNode } from "react";
import { SearchInput } from "./SearchInput";
import { SortMenu } from "./SortMenu";
import type { SortOption } from "@/lib/listview";

/**
 * The header strip above every master-data list: the search box centred, section-specific
 * filters to its left, and the result count and sort control to its right.
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
      {/* Three tracks, so the search is centred against the PAGE rather than against
          whatever happens to sit beside it. The side tracks are equal, so a section with
          filters (only Contacts today) does not drag the box off centre. */}
      <div className="lt-filters">{filters}</div>
      <div className="lt-search">
        <SearchInput value={query} onChange={onQuery} placeholder={placeholder} ariaLabel={searchAriaLabel} />
      </div>
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
