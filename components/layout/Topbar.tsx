"use client";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";

function crumbFor(pathname: string): { section: string; leaf?: string } {
  if (pathname === "/") return { section: "Dashboard" };
  if (pathname.startsWith("/tickets/")) return { section: "Tickets", leaf: pathname.split("/").pop() };
  if (pathname.startsWith("/tickets")) return { section: "Tickets" };
  if (pathname.startsWith("/clients")) return { section: "Clients" };
  if (pathname.startsWith("/products")) return { section: "Products" };
  if (pathname.startsWith("/members")) return { section: "Members" };
  if (pathname.startsWith("/teams")) return { section: "Teams" };
  if (pathname.startsWith("/portal/tickets/"))
    return { section: "My Tickets", leaf: pathname.split("/").pop() };
  if (pathname.startsWith("/portal")) return { section: "My Tickets" };
  return { section: "" };
}

export function Topbar({ onMenu }: { onMenu?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const signOut = useStore((s) => s.signOut);
  const { section, leaf } = crumbFor(pathname);

  const onLogout = async () => {
    await signOut();
    router.push("/login");
  };

  return (
    <div className="topbar">
      {onMenu && (
        <IconButton
          className="nav-toggle"
          icon={<Icon name="menu" />}
          label="Toggle sidebar"
          onClick={onMenu}
        />
      )}
      <div className="crumb">
        {leaf ? (
          <>
            {section} / <b>{leaf}</b>
          </>
        ) : (
          <b>{section}</b>
        )}
      </div>
      {/* Search used to sit here. It only ever searched tickets, so on Clients, Products,
          Team or Contacts it was either useless or actively misleading — it navigated you
          off the list you were reading. Each section now owns a box that searches itself.
          The spacer stays so the crumb and the log-out button keep their positions. */}
      <div className="topbar-center" />
      <button type="button" className="btn ghost" title="Log out" onClick={onLogout}>
        <Icon name="signout" size={16} />
        Log out
      </button>
    </div>
  );
}
