"use client";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";
import { Button } from "./Button";
import { AlertDialog } from "./AlertDialog";
import { lockBodyScroll } from "@/lib/scrollLock";

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
  /** When provided, children + footer are wrapped in a <form> so a type="submit"
   *  button (and the Enter key) trigger this handler. */
  onSubmit?: (e: FormEvent) => void;
  /** Block Escape / backdrop dismissal (e.g. while a destructive action is in flight). */
  disableClose?: boolean;
  /** Explicit "has unsaved changes" flag. ORs with auto-detected input, so an accidental
   *  dismiss (X / backdrop / Escape) warns before discarding. Deliberate actions in the
   *  footer (Cancel / Save) call onClose directly and are never guarded. */
  dirty?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ title, onClose, children, footer, wide, onSubmit, disableClose, dirty }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Any typing/toggling inside the dialog marks it touched, so we can warn on an accidental
  // dismiss even for modals that don't pass an explicit `dirty` flag. (Custom Select menus
  // render in a portal outside this subtree, so pass `dirty` when a Select is the only field.)
  const [touched, setTouched] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const hasChanges = !!dirty || touched;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => setTouched(true);
    el.addEventListener("input", mark);
    el.addEventListener("change", mark);
    return () => {
      el.removeEventListener("input", mark);
      el.removeEventListener("change", mark);
    };
  }, []);

  // A dismissal gesture (X / backdrop / Escape) — guarded when there are unsaved changes.
  const attemptClose = useCallback(() => {
    if (disableClose) return;
    if (hasChanges) setConfirmDiscard(true);
    else onClose();
  }, [disableClose, hasChanges, onClose]);

  // Move focus into the dialog on open, restore it to the trigger on close, and lock
  // background scroll while open. Mount-only so an unrelated re-render can never yank
  // focus back mid-typing.
  useEffect(() => {
    const dialog = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      previouslyFocused?.focus?.();
    };
  }, []);

  // Escape to close (guarded) + Tab focus trap.
  useEffect(() => {
    const dialog = ref.current;
    const focusables = () => (dialog ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)) : []);
    const onKey = (e: KeyboardEvent) => {
      // The discard alert owns the keyboard while it is up: it handles its own Escape, and
      // its buttons render OUTSIDE this dialog's subtree, so the trap below cannot see them
      // and would drag focus back into the form the alert is asking about.
      if (confirmDiscard) return;
      if (e.key === "Escape") {
        attemptClose();
        return;
      }
      if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [attemptClose, confirmDiscard]);

  const inner = (
    <>
      <div className="modal-head">
        <h3>{title}</h3>
        <IconButton icon={<Icon name="x" />} label="Close" onClick={attemptClose} />
      </div>
      {children}
      {footer && <div className="modal-foot">{footer}</div>}
    </>
  );

  return (
    <div
      className="modal-bg"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) attemptClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        {onSubmit ? <form onSubmit={onSubmit}>{inner}</form> : inner}
      </div>

      {confirmDiscard && (
        <AlertDialog
          nested
          tone="warning"
          title="Discard changes?"
          message="You have unsaved changes. Leave without saving them?"
          onDismiss={() => setConfirmDiscard(false)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setConfirmDiscard(false)}>
                Keep editing
              </Button>
              <Button
                variant="primary"
                danger
                onClick={() => {
                  setConfirmDiscard(false);
                  onClose();
                }}
              >
                Discard
              </Button>
            </>
          }
        />
      )}
    </div>
  );
}
