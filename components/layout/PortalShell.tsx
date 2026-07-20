"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode } from "react";
import { useStore } from "@/store";
import { Icon } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Chips";
import { initials } from "@/lib/helpers";

/** Slim chrome for the client POC portal. The portal is a single page, so it gets a
 *  top bar (brand + who + log out) instead of the admin app's full sidebar shell —
 *  which also removes the "My Tickets" that used to repeat in the nav and breadcrumb. */
export function PortalShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const session = useStore((s) => s.session);
  const signOut = useStore((s) => s.signOut);
  if (!session) return null;

  const scope = [session.client, session.div].filter(Boolean).join(" · ");
  const onLogout = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div className="portal-shell">
      <header className="portal-bar">
        <Link href="/portal" className="portal-brand" aria-label="My Tickets — home">
          <span className="brand-glyph">
            <Icon name="logo" size={18} />
          </span>
          <span className="pb-t">
            Inventive Helpdesk<span>Portal</span>
          </span>
        </Link>
        <div className="portal-user">
          <div className="pu-chip">
            {scope && (
              <Badge round className="pu-tag" title={scope}>
                <span className="clip">{scope}</span>
              </Badge>
            )}
            <div className="pu-name" title={session.name}>
              {session.name}
            </div>
            <span className="avatar client">{initials(session.name)}</span>
          </div>
          <button type="button" className="btn ghost" title="Log out" onClick={onLogout}>
            <Icon name="signout" size={16} />
            Log out
          </button>
        </div>
      </header>
      <main className="portal-main">
        <div className="portal-content">{children}</div>
      </main>
    </div>
  );
}
