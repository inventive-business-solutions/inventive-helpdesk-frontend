"use client";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";

function crumbFor(pathname: string): { section: string; leaf?: string } {
  if (pathname === "/") return { section: "Dashboard" };
  if (pathname.startsWith("/tickets/")) return { section: "Tickets", leaf: pathname.split("/").pop() };
  if (pathname.startsWith("/tickets")) return { section: "Tickets" };
  if (pathname.startsWith("/clients")) return { section: "Clients & POCs" };
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
  const session = useStore((s) => s.session);
  const signOut = useStore((s) => s.signOut);
  const { section, leaf } = crumbFor(pathname);
  const [query, setQuery] = useState("");
  const isAdmin = session?.role === "admin";

  const onLogout = async () => {
    await signOut();
    router.push("/login");
  };

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(q ? `/tickets?q=${encodeURIComponent(q)}` : "/tickets");
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
      <div className="topbar-center">
        {isAdmin && (
          <form className="search" onSubmit={onSearch} role="search">
            <Icon name="search" size={16} />
            <input
              placeholder="Search tickets…"
              aria-label="Search tickets"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </form>
        )}
      </div>
      <button type="button" className="btn ghost" title="Log out" onClick={onLogout}>
        <Icon name="signout" size={16} />
        Log out
      </button>
    </div>
  );
}
