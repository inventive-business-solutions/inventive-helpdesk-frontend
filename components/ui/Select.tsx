"use client";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";

export type SelectOption = { value: string; label: string };

/**
 * The single styled dropdown used across the app — filter bars, modal forms, and
 * the ticket-detail rail — so every menu looks and behaves identically.
 *
 * The trigger shows the selected option's label, falling back to `label` (a
 * placeholder / category name, e.g. "Teams" or "— No team —") while the value is
 * empty. The menu renders in a portal with fixed positioning so it is never
 * clipped by a scrolling ancestor (modals set `overflow-y: auto`).
 *
 * Keyboard: ↑/↓ move the highlight (and open when closed), Enter/Space select,
 * Esc closes (without bubbling, so it won't also close a host modal), Tab closes.
 * Click-outside closes.
 *
 * Variants: `block` = full-width form control; `invalid` = error ring;
 * `disabled`; `autoFocus`.
 */
export function Select({
  label,
  value,
  options,
  onChange,
  ariaLabel,
  className = "",
  block = false,
  invalid = false,
  disabled = false,
  autoFocus = false,
  id,
}: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  block?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1); // keyboard-highlighted option index
  const [pos, setPos] = useState<{
    top: number;
    bottom: number;
    left: number;
    width: number;
    up: boolean;
  } | null>(null);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const listboxId = useId(); // for aria-controls / aria-activedescendant wiring
  const optId = (i: number) => `${listboxId}-opt-${i}`;

  const selectedIndex = options.findIndex((o) => o.value === value);
  const hasValue = value !== "";
  const display = hasValue && selectedIndex >= 0 ? options[selectedIndex].label : label;

  useEffect(() => setMounted(true), []);

  // Position the menu from the trigger's viewport rect (fixed → never clipped).
  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 300 && r.top > spaceBelow; // flip up only when cramped
    const left = Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8));
    setPos({ top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, left, width: r.width, up });
  };

  const openMenu = () => {
    if (disabled) return;
    reposition();
    setOpen(true);
  };

  // Keep the menu glued to the trigger while open, even as an ancestor scrolls.
  // (Initial position is set synchronously in openMenu, so a plain effect is fine.)
  useEffect(() => {
    if (!open) return;
    const onMove = () => reposition();
    window.addEventListener("scroll", onMove, true); // capture: catches ancestor scrolls
    window.addEventListener("resize", onMove);
    return () => {
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [open]);

  // Outside click — the menu is portalled out, so check it explicitly too.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) setActive(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, selectedIndex]);

  useEffect(() => {
    if (!open || active < 0) return;
    const el = menuRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return openMenu();
      const n = options.length;
      setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : (i - 1 + n) % n));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) openMenu();
      else if (active >= 0 && active < options.length) choose(options[active].value);
    } else if (e.key === "Escape") {
      if (open) {
        // Swallow it so a host modal's Escape-to-close doesn't also fire.
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const menuStyle: React.CSSProperties = pos
    ? {
        position: "fixed",
        left: pos.left,
        ...(pos.up ? { bottom: pos.bottom } : { top: pos.top }),
        ...(block ? { width: pos.width } : { minWidth: pos.width, maxWidth: "min(320px, 90vw)" }),
      }
    : {};

  const menu = open && pos && (
    <ul
      ref={menuRef}
      id={listboxId}
      className={`ui-select-menu ${pos.up ? "up" : ""}`.trim()}
      role="listbox"
      aria-label={ariaLabel ?? label}
      style={menuStyle}
    >
      {options.map((o, i) => {
        const isSel = o.value === value;
        return (
          <li
            key={o.value || `__opt-${i}`}
            id={optId(i)}
            role="option"
            aria-selected={isSel}
            className={`ui-select-opt ${isSel ? "sel" : ""} ${i === active ? "active" : ""}`.trim()}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(o.value)}
          >
            <span className="ui-select-opt-label">{o.label}</span>
            {isSel && <Icon name="check" size={15} className="ui-select-tick" />}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div
      ref={rootRef}
      className={`ui-select ${block ? "block" : ""} ${invalid ? "invalid" : ""} ${disabled ? "disabled" : ""} ${hasValue ? "has-value" : ""} ${open ? "open" : ""} ${className}`
        .replace(/\s+/g, " ")
        .trim()}
    >
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="ui-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-activedescendant={open && active >= 0 ? optId(active) : undefined}
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        autoFocus={autoFocus}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
      >
        <span className="ui-select-value">{display}</span>
        <Icon name="chevronDown" size={15} className="ui-select-caret" />
      </button>
      {mounted && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
