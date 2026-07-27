import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { DesktopOnly } from "@/components/layout/DesktopOnly";

// Every signed-in route. This is the shell the gate exists for — queues, side-by-side
// detail panes and dense tables, none of which survive a phone width.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <DesktopOnly>
      <AppShell>{children}</AppShell>
    </DesktopOnly>
  );
}
