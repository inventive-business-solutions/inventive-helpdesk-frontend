"use client";
import { AlertDialog } from "./AlertDialog";
import { Button } from "./Button";

/** A small confirm/cancel dialog for destructive actions.
 *
 *  A thin shape over AlertDialog — the ~15 call sites pass a title, a message and a verb,
 *  and should not each have to assemble a pair of buttons in the right order. Kept as its
 *  own name because "confirm this destructive thing" is the common case; reach for
 *  AlertDialog directly when a prompt needs a third choice. */
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
    <AlertDialog
      tone={danger ? "danger" : "warning"}
      title={title}
      message={message}
      onDismiss={onClose}
      // While the action is in flight, Escape and the backdrop stop working — a delete
      // half-way to the server should not be dismissable out from under itself.
      disableDismiss={busy}
      actions={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" danger={danger} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
