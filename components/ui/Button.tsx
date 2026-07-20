import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "default" | "primary" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  /** Destructive tone; pairs with any variant (primary danger = solid, ghost danger = text). */
  danger?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = "default",
  danger = false,
  icon,
  children,
  className = "",
  type = "button",
  ...rest
}: Props) {
  const cls = [
    "btn",
    variant === "primary" ? "primary" : "",
    variant === "ghost" ? "ghost" : "",
    danger ? "danger" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  // Default to type="button" so a Button inside a <form> never submits unless it
  // explicitly opts in with type="submit".
  return (
    <button type={type} className={cls} {...rest}>
      {icon}
      {children}
    </button>
  );
}
