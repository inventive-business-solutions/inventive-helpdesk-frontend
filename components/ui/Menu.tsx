"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

/**
 * Headless popover + option list — the positioning/dismissal machinery is lifted from
 * `Select.tsx` (fixed positioning from the trigger rect, reposition on capture-phase
 * scroll/resize, portal to <body>, click-outside via mousedown, Esc with stopPropagation
 * so it never closes a host modal). Kept separate from `Select` so the app-wide select
 * isn't at regression risk. `Popover` renders arbitrary content; `MenuList` renders the
 * standard `.ui-select-opt` option rows so menus look identical to Select's.
 */
type Pos = { top: number; bottom: number; left: number; width: number; up: boolean };

function usePopover(open: boolean, setOpen: (o: boolean) => void, minWidth: number) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 300 && r.top > spaceBelow;
    const width = Math.max(r.width, minWidth);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, left, width, up });
  }, [minWidth]);

  // Reposition whenever the menu opens (covers both the click path and controlled-open).
  useEffect(() => {
    if (open) reposition();
  }, [open, reposition]);

  // Keep glued to the trigger while open, even as an ancestor scrolls.
  useEffect(() => {
    if (!open) return;
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open, reposition]);

  // Outside click (menu is portalled, so check it explicitly) + Escape.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  return { triggerRef, menuRef, pos, mounted, reposition };
}

export function Popover({
  trigger,
  children,
  ariaLabel,
  open: controlledOpen,
  onOpenChange,
  minWidth = 200,
}: {
  /** The clickable anchor. Wire `ref`/`onClick` onto your button; `open` reflects state. */
  trigger: (p: { ref: React.Ref<HTMLButtonElement>; open: boolean; onClick: () => void }) => ReactNode;
  /** Popover body (an option list, a two-page picker, …). Receives a `close` helper. */
  children: (p: { close: () => void }) => ReactNode;
  ariaLabel: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  minWidth?: number;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = useCallback(
    (o: boolean) => (isControlled ? onOpenChange?.(o) : setInternalOpen(o)),
    [isControlled, onOpenChange],
  );
  const { triggerRef, menuRef, pos, mounted } = usePopover(open, setOpen, minWidth);

  const menu = open && pos && (
    <div
      ref={menuRef}
      className={`ui-select-menu ${pos.up ? "up" : ""}`.trim()}
      role="menu"
      aria-label={ariaLabel}
      style={{
        position: "fixed",
        left: pos.left,
        width: pos.width,
        ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
      }}
    >
      {children({ close: () => setOpen(false) })}
    </div>
  );

  return (
    <>
      {trigger({ ref: triggerRef, open, onClick: () => setOpen(!open) })}
      {mounted && menu ? createPortal(menu, document.body) : null}
    </>
  );
}

export interface MenuOption {
  value: string;
  label: ReactNode;
  selected?: boolean;
}

/** Standard option rows (reuses Select's `.ui-select-opt`/`.ui-select-tick` styling). */
export function MenuList({
  options,
  onSelect,
}: {
  options: MenuOption[];
  onSelect: (value: string) => void;
}) {
  return (
    <>
      {options.map((o, i) => (
        <button
          key={o.value || `__opt-${i}`}
          type="button"
          role="menuitem"
          className={`ui-select-opt ${o.selected ? "sel" : ""}`.trim()}
          onClick={() => onSelect(o.value)}
        >
          <span className="ui-select-opt-label">{o.label}</span>
          {o.selected && <Icon name="check" size={15} className="ui-select-tick" />}
        </button>
      ))}
    </>
  );
}
