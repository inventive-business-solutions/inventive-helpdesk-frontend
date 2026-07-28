"use client";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "./Icon";

/**
 * Headless popover + option list — the positioning/dismissal machinery is lifted from
 * `Select.tsx` (fixed positioning from the trigger rect, reposition on capture-phase
 * scroll/resize, portal to <body>, click-outside via mousedown, Esc with stopPropagation
 * so it never closes a host modal). Kept separate from `Select` so the app-wide select
 * isn't at regression risk. `Popover` renders arbitrary content; `MenuList` renders the
 * standard `.ui-select-opt` option rows so menus look identical to Select's.
 */
type Pos = { top: number; bottom: number; left: number; width: number; up: boolean };

function usePopover(open: boolean, setOpen: (o: boolean) => void, minWidth: number, fitTrigger: boolean) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Pos | null>(null);

  const reposition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const up = spaceBelow < 300 && r.top > spaceBelow;
    // Matching the trigger is right when the trigger is a form control the menu belongs to —
    // a Select's menu narrower or wider than its own box looks broken. It is wrong when the
    // trigger's width has nothing to do with the menu's content: an attachment chip is as
    // wide as its FILENAME, so "Preview here" ended up stranded at the left of a 285px box
    // with dead space beside it. Those menus size to their own content instead.
    const width = fitTrigger ? Math.max(r.width, minWidth) : minWidth;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setPos({ top: r.bottom + 4, bottom: window.innerHeight - r.top + 4, left, width, up });
  }, [minWidth, fitTrigger]);

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

  return { triggerRef, menuRef, pos, reposition };
}

export function Popover({
  trigger,
  children,
  ariaLabel,
  open: controlledOpen,
  onOpenChange,
  minWidth = 200,
  fitTrigger = true,
}: {
  /** The clickable anchor. Wire `ref`/`onClick` onto your button; `open` reflects state. */
  trigger: (p: { ref: React.Ref<HTMLButtonElement>; open: boolean; onClick: () => void }) => ReactNode;
  /** Popover body (an option list, a two-page picker, …). Receives a `close` helper. */
  children: (p: { close: () => void }) => ReactNode;
  ariaLabel: string;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  minWidth?: number;
  /** Stretch the menu to the trigger's width (default). Pass false when the trigger's width
   *  is unrelated to the menu's content — an attachment chip is as wide as its filename, and
   *  a menu stretched to that leaves its rows stranded against a wall of empty space. */
  fitTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen! : internalOpen;
  const setOpen = useCallback(
    (o: boolean) => (isControlled ? onOpenChange?.(o) : setInternalOpen(o)),
    [isControlled, onOpenChange],
  );
  const { triggerRef, menuRef, pos } = usePopover(open, setOpen, minWidth, fitTrigger);

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
      {/* No `mounted` guard needed: `menu` is `open && pos && (…)`, and both start
          falsy, so this is null on the server and on the first client render alike. */}
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

export interface MenuOption {
  value: string;
  label: ReactNode;
  /** Optional glyph for this row. See MenuList for how a mixed list is aligned. */
  icon?: IconName;
  selected?: boolean;
}

/**
 * Standard option rows — the ONLY way a menu row should be built.
 *
 * It used to render whatever `label` it was handed, which meant each caller decided how its
 * rows looked. FacetBar wrapped labels in an icon box with its own 12.5px type; SortMenu and
 * the attachment menu passed bare strings and got the row's 13px with no icon column. Same
 * control, three appearances, and the difference only showed when two of them were open near
 * each other. Every fix for it was per-caller, so the next menu written reintroduced it —
 * which is exactly what happened when the attachment menu was added.
 *
 * The structure now lives here and callers cannot opt out. `icon` is the only knob:
 *
 * - No row in the list has an icon → no icon column. A menu of plain choices should not
 *   carry a 30px indent for glyphs that do not exist.
 * - ANY row has one → every row reserves the column, so the labels stay on one vertical
 *   line instead of the iconless ones hanging left.
 *
 * One type scale throughout, taken from `.ui-select-opt` itself, so a menu row is the same
 * size everywhere in the app including the plain <Select> dropdowns that share the class.
 */
export function MenuList({
  options,
  onSelect,
}: {
  options: MenuOption[];
  onSelect: (value: string) => void;
}) {
  const anyIcon = options.some((o) => o.icon);
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
          <span className="menu-opt">
            {anyIcon && (
              <span className={`menu-opt-ic ${o.icon ? "" : "blank"}`.trim()} aria-hidden="true">
                {o.icon && <Icon name={o.icon} size={14} />}
              </span>
            )}
            <span className="ui-select-opt-label">{o.label}</span>
          </span>
          {o.selected && <Icon name="check" size={15} className="ui-select-tick" />}
        </button>
      ))}
    </>
  );
}
