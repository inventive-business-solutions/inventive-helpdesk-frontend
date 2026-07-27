"use client";
import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";
import { lockBodyScroll } from "@/lib/scrollLock";

export type AlertTone = "danger" | "warning" | "info";

/** Only the tint changes between danger and warning — both are "stop and read this", and
 *  giving them different glyphs makes the pair look like two unrelated things. */
const TONE_ICON: Record<AlertTone, "alert" | "info"> = {
  danger: "alert",
  warning: "alert",
  info: "info",
};

const FOCUSABLE = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

/**
 * A prompt that asks one question: confirm a destructive action, warn about unsaved work,
 * state something the person has to acknowledge.
 *
 * Separate from Modal on purpose. Modal is form chrome — a titled header with a close
 * button, a scrolling body, a footer rail — and every prompt in the app was borrowing it
 * to ask a two-line question. That is why they read as a different product: heavy dividers
 * around one sentence, a close ✕ next to buttons that already say Cancel, and a title run
 * through `.modal-head h3`'s `text-transform: capitalize`, which turned the authored
 * "Discard changes?" into "Discard Changes?" — title case in an app written in sentence
 * case throughout.
 *
 * Same surface, radius, shadow and backdrop as Modal, so it is visibly the same family;
 * no head/foot rules, an icon carrying the severity, and the title left in the case it
 * was written in.
 *
 * Owns the keyboard while open, including when stacked over a Modal: its buttons render
 * outside that Modal's subtree, so the Modal's own Tab trap cannot see them and would pull
 * focus back into the form behind this. Modal defers to it while it is up.
 */
export function AlertDialog({
  tone = "warning",
  title,
  message,
  actions,
  onDismiss,
  nested,
  disableDismiss,
}: {
  /** Picks the icon tint. `danger` for irreversible, `warning` to interrupt, `info` to tell. */
  tone?: AlertTone;
  title: string;
  message: ReactNode;
  /** The buttons. Least destructive first — it is what gets focus on open. */
  actions: ReactNode;
  /** Escape, backdrop click, and the safe way out. */
  onDismiss: () => void;
  /** Stacked over an open Modal — raises it above that Modal's backdrop. */
  nested?: boolean;
  /** Block Escape/backdrop while an action is in flight, so a half-finished delete cannot
   *  be dismissed out from under itself. */
  disableDismiss?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const msgId = useId();

  const dismiss = useCallback(() => {
    if (!disableDismiss) onDismiss();
  }, [disableDismiss, onDismiss]);

  // Focus the first action (the safe one) rather than the dialog, so Enter answers the
  // question the safe way. Restore focus to whatever opened this on unmount. Scroll is
  // locked here too: nested over a Modal this is a no-op it already did, and standalone
  // there is nothing else to do it.
  useEffect(() => {
    const el = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    (el?.querySelector<HTMLElement>(FOCUSABLE) ?? el)?.focus();
    const unlock = lockBodyScroll();
    return () => {
      unlock();
      previouslyFocused?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const items = ref.current ? Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)) : [];
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
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dismiss]);

  return (
    <div
      className={`modal-bg ${nested ? "nested" : ""}`.trim()}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div
        ref={ref}
        className={`modal alert ${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={msgId}
        tabIndex={-1}
      >
        <div className="alert-body">
          <span className="alert-ic" aria-hidden="true">
            <Icon name={TONE_ICON[tone]} size={17} strokeWidth={2} />
          </span>
          <div className="alert-text">
            <h3 id={titleId}>{title}</h3>
            <p id={msgId}>{message}</p>
          </div>
        </div>
        <div className="alert-foot">{actions}</div>
      </div>
    </div>
  );
}
