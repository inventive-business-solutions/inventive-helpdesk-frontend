import type { ButtonHTMLAttributes, ReactNode } from "react";

type Size = "md" | "sm";
type Tone = "default" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Glyph to render — typically an <Icon />. Its size is fixed by the button, not the icon. */
  icon: ReactNode;
  /** Accessible name; also shown as the hover tooltip. */
  label: string;
  size?: Size;
  tone?: Tone;
}

/**
 * The one inline icon button. `md` (34px) is the bordered surface control used in
 * toolbars, modals and the ticket header; `sm` (26px) is the borderless row action
 * used for inline edit/delete. `tone="danger"` tints the hover for destructive actions.
 */
export function IconButton({
  icon,
  label,
  size = "md",
  tone = "default",
  className = "",
  type = "button",
  ...rest
}: Props) {
  const cls = ["iconbtn", size === "sm" ? "sm" : "", tone === "danger" ? "danger" : "", className]
    .filter(Boolean)
    .join(" ");
  return (
    <button type={type} className={cls} title={label} aria-label={label} {...rest}>
      {icon}
    </button>
  );
}
