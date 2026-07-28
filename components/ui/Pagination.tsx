"use client";
import type { ReactNode } from "react";
import { Select } from "@/components/ui/Select";

const PAGE_SIZES = [10, 25, 50];

/**
 * Shared list footer: a "per page" size selector plus a Prev/Next pager.
 * Controlled — the caller owns `page`/`pageSize` state and does the slicing; this
 * just renders the controls. Renders nothing when there's nothing to page.
 */
export function Pagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  unit = "rows",
  label = "Rows per page",
  pageSizes = PAGE_SIZES,
  divider = true,
  trailing,
}: {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  unit?: string;
  label?: string;
  /** Selectable page sizes (default 10/25/50). */
  pageSizes?: number[];
  divider?: boolean;
  /** A second list control, shown beside "per page" in the same row. Teams uses it for
   *  "Show members per team". It lived in a card of its own directly below this one, which
   *  put two settings of the same kind in two stacked bars — twice the chrome for one idea.
   *  Wrap it in `.page-ctl` to pick up the label/select metrics used here. */
  trailing?: ReactNode;
}) {
  if (total === 0) return null;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageSafe = Math.min(page, totalPages);
  return (
    <div className={`pagination ${divider ? "" : "no-divider"}`.trim()}>
      <div className="rows-per-page">
        <span>{label}</span>
        <Select
          className="plain"
          label="Rows"
          ariaLabel={label}
          value={String(pageSize)}
          options={pageSizes.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => {
            onPageSizeChange(Number(v));
            onPageChange(1); // jump back to the first page on a size change
          }}
        />
      </div>
      {trailing}
      {totalPages > 1 && (
        <div className="pager">
          <button
            type="button"
            className="btn ghost"
            disabled={pageSafe <= 1}
            onClick={() => onPageChange(pageSafe - 1)}
          >
            Prev
          </button>
          <span className="page-info">
            Page {pageSafe} of {totalPages} · {total} {unit}
          </span>
          <button
            type="button"
            className="btn ghost"
            disabled={pageSafe >= totalPages}
            onClick={() => onPageChange(pageSafe + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
