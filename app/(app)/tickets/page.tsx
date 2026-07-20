import { Suspense } from "react";
import { Tickets } from "@/components/pages/Tickets";

export const metadata = { title: "Tickets" };

export default function Page() {
  return (
    <Suspense fallback={<div className="empty-state">Loading…</div>}>
      <Tickets />
    </Suspense>
  );
}
