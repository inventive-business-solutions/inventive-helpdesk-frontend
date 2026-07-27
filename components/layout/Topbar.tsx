"use client";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { TOPBAR_SLOT_ID } from "@/components/layout/TopbarSlot";

function crumbFor(pathname: string): { section: string; leaf?: string } {
  if (pathname === "/") return { section: "Dashboard" };
  if (pathname.startsWith("/tickets/")) return { section: "Tickets", leaf: pathname.split("/").pop() };
  if (pathname.startsWith("/tickets")) return { section: "Tickets" };
  if (pathname.startsWith("/clients")) return { section: "Clients" };
  // /contacts and /admin were missing, so those two sections rendered a topbar with no
  // title at all while every other section had one. Labels match the sidebar's.
  if (pathname.startsWith("/contacts")) return { section: "Contacts" };
  if (pathname.startsWith("/products")) return { section: "Products" };
  if (pathname.startsWith("/members")) return { section: "Members" };
  if (pathname.startsWith("/teams")) return { section: "Teams" };
  if (pathname.startsWith("/admin")) return { section: "Admin" };
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
      {/* Centre slot. The GLOBAL search that used to live here is not coming back — it only
          ever searched tickets, so on Clients or Products it was useless or actively
          misleading. What fills this now is the current section's OWN search, portalled in
          by that page (see TopbarSlot), so the position is shared and the behaviour is not.
          Empty on pages without one, where it keeps the crumb and log-out button in place. */}
      <div className="topbar-center" id={TOPBAR_SLOT_ID} />
      <button type="button" className="btn ghost" title="Log out" onClick={onLogout}>
        <Icon name="signout" size={16} />
        Log out
      </button>
    </div>
  );
}
