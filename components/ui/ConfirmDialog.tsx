"use client";
import { Modal } from "./Modal";
import { Button } from "./Button";

/** A small confirm/cancel dialog for destructive actions. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  busy,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      disableClose={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" danger={danger} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="modal-body">
        <p style={{ margin: 0, color: "var(--ink-2)", lineHeight: 1.5 }}>{message}</p>
      </div>
    </Modal>
  );
}
