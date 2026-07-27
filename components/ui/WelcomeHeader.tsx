import type { ReactNode } from "react";
import { initials } from "@/lib/helpers";

/**
 * Shared "Welcome back, <name>" page header: an initials avatar, a small eyebrow, the
 * first name picked out in the accent colour, and an optional subtitle. `children` render as
 * the right-side controls (buttons, a range switch, …). Used across the member and manager
 * dashboards and the client portal so the greeting looks identical everywhere.
 */
export function WelcomeHeader({
  name,
  eyebrow,
  subtitle,
  children,
}: {
  name: string;
  eyebrow?: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const first = (name || "").trim().split(/\s+/)[0] || "there";
  return (
    <div className="page-head">
      <div className="hi">
        <span className="hi-av" aria-hidden="true">
          {initials(name || "")}
        </span>
        <div className="hi-text">
          {eyebrow && <div className="hi-eyebrow">{eyebrow}</div>}
          <h1>
            Welcome back, <span className="hi-name">{first}</span>
          </h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {children && <div className="head-controls">{children}</div>}
    </div>
  );
}
