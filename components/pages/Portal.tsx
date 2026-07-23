"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { type SelectOption } from "@/components/ui/Select";
import { FacetBar } from "@/components/ui/FacetBar";
import { Pagination } from "@/components/ui/Pagination";
import { TicketTable } from "@/components/ui/TicketTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { WelcomeHeader } from "@/components/ui/WelcomeHeader";
import { NewTicketModal } from "@/components/modals/NewTicketModal";
import { buildFacets, type FacetOpts } from "@/lib/facets";
import { MONTHS, RESOLVED, isActive, parseISO } from "@/lib/helpers";
import type { Status, TicketType } from "@/types";

type PortalFilter = "all" | "open" | "pending" | "resolved";

// Full option lists so every status/type is filterable even when the client has no
// ticket in that state yet — matches the admin Tickets filters.
const STATUSES: Status[] = [
  "New",
  "Acknowledged",
  "In Progress",
  "Pending Client",
  "Reopened",
  "Resolved",
  "Closed",
];
const TYPES: TicketType[] = ["Bug", "Query", "Improvement", "New Feature"];

export function Portal() {
  const router = useRouter();
  const session = useStore((s) => s.session);
  const tickets = useStore((s) => s.tickets);
  const clients = useStore((s) => s.clients);
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState<PortalFilter>("all");
  // Dropdown filters (empty string = "all"), mirroring the admin Tickets page.
  const [statusF, setStatusF] = useState("");
  const [typeF, setTypeF] = useState("");
  const [sourceF, setSourceF] = useState("");
  const [productF, setProductF] = useState("");
  const [monthF, setMonthF] = useState("");
  const [yearF, setYearF] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const openTicket = (tid: string) => router.push(`/portal/tickets/${tid}`);

  // Reset to page 1 whenever any filter changes (so you never land on an empty page).
  const filterKey = `${filter}|${statusF}|${typeF}|${sourceF}|${productF}|${monthF}|${yearF}`;
  useEffect(() => setPage(1), [filterKey]);

  if (!session) return null;

  // Scoped by the divisions this contact holds, not one label: a lead may oversee
  // several. `t.div` is the display name, so compare against the resolved names rather
  // than the docnames the session carries.
  const myDivNames = new Set(
    (session.divisions ?? []).map(
      (dn) => clients.flatMap((c) => c.divisions).find((d) => d.docname === dn)?.name ?? dn,
    ),
  );
  const mine = tickets.filter((t) => t.client === session.client && myDivNames.has(t.div));
  const open = mine.filter((t) => isActive(t.status));
  const pending = mine.filter((t) => t.status === "Pending Client");
  const resolved = mine.filter((t) => RESOLVED.includes(t.status));

  // Clicking a KPI toggles its quick-filter (click again to clear).
  const toggle = (f: PortalFilter) => setFilter((cur) => (cur === f ? "all" : f));

  // The products this contact's client runs. Now genuinely several: a client may run a
  // different product per division, so show the ones covering the divisions they hold
  // plus any attached client-wide (an empty division list).
  const myClient = clients.find((c) => c.name === session.client);
  const myProducts = [
    ...new Set(
      (myClient?.products ?? [])
        .filter((p) => p.divisions.length === 0 || p.divisions.some((d) => (session.divisions ?? []).includes(d)))
        .map((p) => p.product),
    ),
  ];

  // Option lists. Status/Type are the full canonical sets; the rest are data-driven.
  const years = Array.from(
    new Set(mine.map((t) => parseISO(t.createdISO)?.getFullYear()).filter((y): y is number => !!y)),
  ).sort((a, b) => b - a);
  const statusOpts: SelectOption[] = [
    { value: "", label: "All statuses" },
    ...STATUSES.map((s) => ({ value: s, label: s })),
  ];
  const typeOpts: SelectOption[] = [
    { value: "", label: "All types" },
    ...TYPES.map((t) => ({ value: t, label: t })),
  ];
  const sourceOpts: SelectOption[] = [
    { value: "", label: "All sources" },
    { value: "Portal", label: "Raised in portal" },
    { value: "Email", label: "Raised by email" },
  ];
  const productOpts: SelectOption[] = [
    { value: "", label: "All products" },
    ...myProducts.map((p) => ({ value: p, label: p })),
  ];
  const monthOpts: SelectOption[] = [
    { value: "", label: "All months" },
    ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
  ];
  const yearOpts: SelectOption[] = [
    { value: "", label: "All years" },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ];

  // Base bucket from the KPI quick-filter, then narrowed by the dropdown filters.
  const base =
    filter === "open" ? open : filter === "pending" ? pending : filter === "resolved" ? resolved : mine;
  const rows = base.filter((t) => {
    if (statusF && t.status !== statusF) return false;
    if (typeF && t.type !== typeF) return false;
    if (sourceF && (t.source ?? "Portal") !== sourceF) return false;
    if (productF && !myProducts.includes(productF)) return false;
    if (monthF && (parseISO(t.createdISO)?.getMonth() ?? -1) + 1 !== Number(monthF)) return false;
    if (yearF && parseISO(t.createdISO)?.getFullYear() !== Number(yearF)) return false;
    return true;
  });

  // Secondary filters via the faceted bar — the client role gets only Status / Type /
  // Source / Product / Date (buildFacets structurally omits Team/Member/etc.). The KPI
  // quick-filters above stay as the bucket.
  const facetOpts: FacetOpts = {
    product: productOpts,
    type: typeOpts,
    status: statusOpts,
    source: sourceOpts,
    month: monthOpts,
    year: yearOpts,
    client: [],
    division: [],
    poc: [],
    team: [],
    member: [],
    priority: [],
  };
  const { facets } = buildFacets({ role: "client", opts: facetOpts });
  const setters: Record<string, (v: string) => void> = {
    status: setStatusF,
    type: setTypeF,
    source: setSourceF,
    product: setProductF,
    month: setMonthF,
    year: setYearF,
  };
  const values: Record<string, string> = {
    status: statusF,
    type: typeF,
    source: sourceF,
    product: productF,
    month: monthF,
    year: yearF,
  };
  const anyFilter =
    filter !== "all" || !!statusF || !!typeF || !!sourceF || !!productF || !!monthF || !!yearF;
  const clearAll = () => {
    setFilter("all");
    setStatusF("");
    setTypeF("");
    setSourceF("");
    setProductF("");
    setMonthF("");
    setYearF("");
  };

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = rows.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  return (
    <>
      <WelcomeHeader
        name={session.name}
        eyebrow="Support portal"
        subtitle="Track every request you've raised — in the portal or by email — and pick up the conversation any time."
      >
        <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowNew(true)}>
          Raise a ticket
        </Button>
      </WelcomeHeader>

      <div className="kpi-grid three">
        <Kpi
          label="Open"
          value={open.length}
          sub="In progress"
          color="var(--accent)"
          onClick={() => toggle("open")}
          active={filter === "open"}
        />
        <Kpi
          label="Awaiting you"
          value={pending.length}
          sub="Needs your reply"
          color="var(--warning)"
          onClick={() => toggle("pending")}
          active={filter === "pending"}
        />
        <Kpi
          label="Resolved"
          value={resolved.length}
          sub="All time"
          color="var(--good)"
          onClick={() => toggle("resolved")}
          active={filter === "resolved"}
        />
      </div>

      <FacetBar
        facets={facets}
        values={values}
        onChange={(k, v) => setters[k]?.(v)}
        onClear={(keys) => keys.forEach((k) => setters[k]?.(""))}
        onClearAll={clearAll}
        count={rows.length}
        unit="ticket"
      />

      <div className="card">
        <div className="table-wrap">
          <TicketTable
            tickets={rows.length ? pageRows : []}
            audience="client"
            onOpen={openTicket}
            empty={
              <EmptyState>
                {anyFilter ? (
                  "No tickets match these filters."
                ) : (
                  <>
                    No tickets yet — use <b>Raise a ticket</b> to send your first.
                  </>
                )}
              </EmptyState>
            }
          />
        </div>
        <Pagination
          total={rows.length}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          unit="tickets"
        />
      </div>

      {showNew && <NewTicketModal onClose={() => setShowNew(false)} />}
    </>
  );
}
