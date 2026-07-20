"use client";
import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * Standard modal footer: an optional left-aligned slot (e.g. a "Remove" action),
 * a Cancel button, and a primary submit button that shows `busyLabel` while the
 * form is in flight. Collapses the Cancel/Submit block duplicated across ~11 modals.
 *
 * Use inside a `<Modal onSubmit>`: the submit button is `type="submit"`, so it
 * triggers the form (and the Enter key).
 */
export function ModalFooter({
  submitLabel,
  busyLabel,
  busy,
  submitDisabled,
  onCancel,
  left,
}: {
  submitLabel: string;
  busyLabel: string;
  busy?: boolean;
  /** Extra condition that disables the submit button (e.g. nothing to submit). */
  submitDisabled?: boolean;
  onCancel: () => void;
  left?: ReactNode;
}) {
  return (
    <>
      {left}
      <Button variant="ghost" onClick={onCancel} disabled={busy}>
        Cancel
      </Button>
      <Button type="submit" variant="primary" disabled={busy || submitDisabled}>
        {busy ? busyLabel : submitLabel}
      </Button>
    </>
  );
}
