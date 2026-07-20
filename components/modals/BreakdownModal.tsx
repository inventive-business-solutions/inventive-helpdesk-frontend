"use client";
import { Modal } from "../ui/Modal";
import { BarList, type BarRow } from "../ui/BarList";

/**
 * Popup that shows a dashboard breakdown's COMPLETE list (e.g. every member and the
 * tickets assigned to them) — opened from "View all" / "+N more". Clicking a row opens
 * that row's tickets; the list itself never navigates away.
 */
export function BreakdownModal({
  title,
  rows,
  onSelect,
  onClose,
}: {
  title: string;
  rows: BarRow[];
  onSelect: (href: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        <p className="breakdown-hint">
          {rows.length} {rows.length === 1 ? "entry" : "entries"} · click one to open its tickets
        </p>
        <div className="breakdown-list">
          <BarList rows={rows} onSelect={onSelect} />
        </div>
      </div>
    </Modal>
  );
}
