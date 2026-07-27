"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/store";
import { Button } from "@/components/ui/Button";
import { BackButton, withOrigin } from "@/components/ui/BackButton";
import { Icon } from "@/components/ui/Icon";
import { type SelectOption } from "@/components/ui/Select";
import { FacetBar } from "@/components/ui/FacetBar";
import { SearchInput } from "@/components/ui/SearchInput";
import { SortMenu } from "@/components/ui/SortMenu";
import { applySort, commonSorts, useStoredSort } from "@/lib/listview";
import { Pagination } from "@/components/ui/Pagination";
import { TicketTable } from "@/components/ui/TicketTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { TruncationNotice } from "@/components/ui/TruncationNotice";
import { NewTicketModal } from "@/components/modals/NewTicketModal";
import { ASTATE_LABELS, buildFacets, type FacetOpts } from "@/lib/facets";
import {
  MONTHS,
  RESOLVED,
  clientsRunning,
  enc,
  isActive,
  needsAttention,
  parseISO,
  productsOf,
} from "@/lib/helpers";
import type { Priority, Status, Ticket, TicketType } from "@/types";

// Canonical option sets so every value is filterable even when no ticket is in that state.
const TYPES: TicketType[] = ["Bug", "Query", "Improvement", "New Feature"];
const STATUSES: Status[] = [
  "New",
  "Acknowledged",
  "In Progress",
  "Pending Client",
  "Reopened",
  "Resolved",
  "Closed",
];
const PRIORITIES: Priority[] = ["Critical", "High", "Medium", "Low"];

export function Tickets() {
  const router = useRouter();
  const sp = useSearchParams();
  const tickets = useStore((s) => s.tickets);
  const unread = useStore((s) => s.unread);
  const clients = useStore((s) => s.clients);
  const members = useStore((s) => s.members);
  const groups = useStore((s) => s.groups);
  const products = useStore((s) => s.products);
  // Managers get the full filter set; agents (staff, non-manager) get a focused set + their
  // own teams (their "my work" views live in the sidebar). See buildFacets.
  const session = useStore((s) => s.session);
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const filterKey = sp.toString();
  useEffect(() => setPage(1), [filterKey]); // any filter/search change → back to page 1

  // Changes one query param while preserving every other active filter.
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    // Guarded like setParams/setSearch below: clearing the LAST filter otherwise pushes
    // "/tickets?", a trailing-? URL that differs from the clean "/tickets" every other
    // path in this file produces. Same navigation, but it leaves a URL you would not want
    // to copy out of the address bar or compare against.
    const qs = next.toString();
    router.push(qs ? `/tickets?${qs}` : "/tickets");
  };
  // Search writes straight to the URL rather than to local state, so the query stays
  // shareable and the "Search" chip below keeps reflecting it — but with `replace`, not
  // `push`: typing eight characters must not bury the previous page under eight history
  // entries that Back then has to walk through one at a time.
  const setSearch = (value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    const qs = next.toString();
    router.replace(qs ? `/tickets?${qs}` : "/tickets");
  };

  // Changes several params in one navigation — used by the cascade + bucket/status exclusivity.
  const setParams = (updates: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, val] of Object.entries(updates)) {
      if (val) next.set(k, val);
      else next.delete(k);
    }
    const qs = next.toString();
    router.push(qs ? `/tickets?${qs}` : "/tickets");
  };
  // Carry the filtered list URL along, so the ticket's Back returns to the exact view you
  // opened it from rather than to a bare, unfiltered /tickets.
  const openTicket = (tid: string) =>
    router.push(withOrigin(`/tickets/${tid}`, `/tickets${sp.toString() ? `?${sp.toString()}` : ""}`));

  const active = sp.get("active");
  const resolved = sp.get("resolved");
  const type = sp.get("type");
  const status = sp.get("status");
  const priority = sp.get("priority");
  const client = sp.get("client");
  const div = sp.get("div");
  const poc = sp.get("poc");
  const assignee = sp.get("assignee");
  const sla = sp.get("sla");
  const attention = sp.get("attention");
  const source = sp.get("source");
  const group = sp.get("group");
  const astate = sp.get("astate"); // assignment state: unassigned | team | member
  const mine = sp.get("mine"); // agent "my work" view: me | triage | collab
  const teamq = sp.get("teamq"); // a single team's unclaimed queue (agent per-team view)
  const q = sp.get("q");
  const product = sp.get("product");
  const month = sp.get("month");
  const year = sp.get("year");

  // Apply every active filter to the ticket list (predicates unchanged from before).
  const rows = useMemo(() => {
    let r = tickets.slice();
    // Exact, on the ticket's own field. `none` is the Untagged bucket — emailed-in
    // tickets nobody has classified yet — using the same sentinel convention as the team
    // filter below. Inference is gone: the ticket now says which product it is about.
    if (product) r = r.filter((t) => (product === "none" ? !t.product : t.product === product));
    if (active) r = r.filter((t) => isActive(t.status));
    if (resolved) r = r.filter((t) => RESOLVED.includes(t.status));
    if (type) r = r.filter((t) => t.type === type);
    if (status) r = r.filter((t) => t.status === status);
    if (priority) r = r.filter((t) => t.priority === priority);
    if (client) r = r.filter((t) => t.client === client);
    if (div) r = r.filter((t) => t.div === div);
    if (poc) r = r.filter((t) => t.raisedBy === poc);
    if (assignee) r = r.filter((t) => t.assignee === assignee);
    if (sla) r = r.filter((t) => t.slaRisk && isActive(t.status));
    if (source) r = r.filter((t) => t.source === source);
    if (group) r = r.filter((t) => (group === "none" ? !t.group : t.group === group));
    if (astate === "unassigned") r = r.filter((t) => !t.group && t.assignee === "Unassigned");
    else if (astate === "team") r = r.filter((t) => !!t.group && t.assignee === "Unassigned");
    else if (astate === "member") r = r.filter((t) => t.assignee !== "Unassigned");
    if (teamq) r = r.filter((t) => t.group === teamq && t.assignee === "Unassigned");
    if (mine) {
      const me = session?.member;
      const teams = session?.teams ?? [];
      if (mine === "me") r = r.filter((t) => !!me && t.assignee === me);
      else if (mine === "triage") r = r.filter((t) => !t.group);
      else if (mine === "collab")
        r = r.filter(
          (t) => !!t.group && !teams.includes(t.group) && t.assignee !== me && t.owner !== session?.user,
        );
    }
    if (month) r = r.filter((t) => (parseISO(t.createdISO)?.getMonth() ?? -1) + 1 === Number(month));
    if (year) r = r.filter((t) => parseISO(t.createdISO)?.getFullYear() === Number(year));
    if (attention) r = r.filter(needsAttention);
    if (q) {
      const needle = q.trim().toLowerCase();
      r = r.filter(
        (t) =>
          t.title.toLowerCase().includes(needle) ||
          t.id.toLowerCase().includes(needle) ||
          t.client.toLowerCase().includes(needle) ||
          t.raisedBy.toLowerCase().includes(needle),
      );
    }
    return r;
  }, [
    tickets,
    product,
    active,
    resolved,
    type,
    status,
    priority,
    client,
    div,
    poc,
    assignee,
    sla,
    source,
    group,
    astate,
    mine,
    teamq,
    session,
    month,
    year,
    attention,
    q,
  ]);

  const years = useMemo(
    () =>
      Array.from(
        new Set(tickets.map((t) => parseISO(t.createdISO)?.getFullYear()).filter((y): y is number => !!y)),
      ).sort((a, b) => b - a),
    [tickets],
  );

  // People in the agent's own teams — powers their (scoped) Member filter.
  const myTeamMembers = useMemo(() => {
    const teamSet = new Set(session?.teams ?? []);
    const names = new Set<string>();
    for (const g of groups) if (teamSet.has(g.name)) g.members.forEach((m) => names.add(m));
    return [...names];
  }, [groups, session]);

  // ---- cascading Product → Client → Division → POC (managers) ----
  const clientByName = (n: string) => clients.find((c) => c.name === n);
  // A client can run several products now, so this is a list. It replaced productOf(),
  // which returned the single legacy Client.product.
  const productsFor = (cn: string) => productsOf(clientByName(cn));
  const clientHasDiv = (cn: string, dn: string) => !!clientByName(cn)?.divisions.some((d) => d.name === dn);
  const clientsWithDiv = (dn: string) => clients.filter((c) => c.divisions.some((d) => d.name === dn));
  const clientInProduct = (cn: string, p: string) => !p || productsFor(cn).includes(p);
  const pocRefs = useMemo(
    () =>
      clients.flatMap((c) =>
        c.divisions.flatMap((d) => d.pocs.map((p) => ({ name: p.name, client: c.name, div: d.name }))),
      ),
    [clients],
  );
  const pocValid = (name: string, cn: string, dn: string) =>
    pocRefs.some((r) => r.name === name && (!cn || r.client === cn) && (!dn || r.div === dn));
  const findPoc = (name: string, cn?: string | null, dn?: string | null) => {
    const ms = pocRefs.filter((r) => r.name === name);
    return ms.find((r) => (!cn || r.client === cn) && (!dn || r.div === dn)) ?? ms[0];
  };

  // Only imply a product from the chosen client when there is no ambiguity. A client
  // running two products has no single implied one, and picking the first would silently
  // filter the list by something the user never chose.
  const clientProducts = client ? productsFor(client) : [];
  const impliedProduct = product || (clientProducts.length === 1 ? clientProducts[0] : "");
  // "none" is the Untagged bucket, not a product — narrowing the client list by it would
  // find no client that "runs" it and empty every downstream dropdown.
  const realProduct = product && product !== "none" ? product : "";
  const scopedClients = realProduct ? clientsRunning(clients, realProduct) : clients;
  const divScopeClients = client ? clients.filter((c) => c.name === client) : scopedClients;
  // Not narrowed by the product filter: product is now an exact field on the ticket, so
  // Product and Division compose like any other pair of filters.
  const divNames = Array.from(new Set(divScopeClients.flatMap((c) => c.divisions.map((d) => d.name)))).sort(
    (a, b) => a.localeCompare(b),
  );
  const pocNames = Array.from(
    new Set(
      pocRefs
        .filter(
          (r) =>
            (!realProduct || clientInProduct(r.client, realProduct)) &&
            (!client || r.client === client) &&
            (!div || r.div === div),
        )
        .map((r) => r.name),
    ),
  ).sort((a, b) => a.localeCompare(b));

  // Option lists (each leads with an "All …" row that buildFacets strips for the pills).
  const productOpts: SelectOption[] = [
    { value: "", label: "All products" },
    // Emailed-in tickets arrive with no product and are tagged at triage. Without this
    // they'd be reachable by no product filter at all — invisible rather than a number
    // someone can work through. Same sentinel convention as "No team".
    { value: "none", label: "Untagged" },
    ...products.map((p) => ({ value: p.name, label: p.name })),
  ];
  const clientOpts: SelectOption[] = [
    { value: "", label: "All clients" },
    ...scopedClients.map((c) => ({ value: c.name, label: c.name })),
  ];
  const divisionOpts: SelectOption[] = [
    { value: "", label: "All divisions" },
    ...divNames.map((d) => ({ value: d, label: d })),
  ];
  const pocOpts: SelectOption[] = [
    { value: "", label: "All contacts" },
    ...pocNames.map((p) => ({ value: p, label: p })),
  ];
  const typeOpts: SelectOption[] = [
    { value: "", label: "All types" },
    ...TYPES.map((t) => ({ value: t, label: t })),
  ];
  const statusOpts: SelectOption[] = [
    { value: "", label: "All statuses" },
    ...STATUSES.map((s) => ({ value: s, label: s })),
  ];
  const priorityOpts: SelectOption[] = [
    { value: "", label: "All priorities" },
    ...PRIORITIES.map((p) => ({ value: p, label: p })),
  ];
  const sourceOpts: SelectOption[] = [
    { value: "", label: "All sources" },
    { value: "Portal", label: "Raised in portal" },
    { value: "Email", label: "Raised by email" },
  ];
  const teamOpts: SelectOption[] = [
    { value: "", label: "All teams" },
    { value: "none", label: "No team" },
    ...groups.map((g) => ({ value: g.name, label: g.name })),
  ];
  const memberOpts: SelectOption[] = [
    { value: "", label: "All members" },
    { value: "Unassigned", label: "Unassigned" },
    ...members.map((m) => ({ value: m.name, label: m.name })),
  ];
  const monthOpts: SelectOption[] = [
    { value: "", label: "All months" },
    ...MONTHS.map((m, i) => ({ value: String(i + 1), label: m })),
  ];
  const yearOpts: SelectOption[] = [
    { value: "", label: "All years" },
    ...years.map((y) => ({ value: String(y), label: String(y) })),
  ];

  // Cascade handlers — set several params at once, dropping now-invalid downstream picks.
  const onProductPick = (v: string) => {
    const keepClient = client && clientInProduct(client, v) ? client : "";
    const keepDiv = keepClient && div && clientHasDiv(keepClient, div) ? div : "";
    const keepPoc = keepClient && poc && pocValid(poc, keepClient, keepDiv) ? poc : "";
    setParams({ product: v, client: keepClient, div: keepDiv, poc: keepPoc });
  };
  const onClientPick = (v: string) => {
    const nextDiv = v && div && !clientHasDiv(v, div) ? "" : (div ?? "");
    const nextPoc = poc && pocValid(poc, v, nextDiv) ? poc : "";
    setParams({ client: v, div: nextDiv, poc: nextPoc });
  };
  const onDivisionPick = (v: string) => {
    let nextClient = client ?? "";
    if (v && !nextClient) {
      const owners = clientsWithDiv(v).filter((c) => clientInProduct(c.name, realProduct));
      if (owners.length === 1) nextClient = owners[0].name;
    }
    const nextPoc = poc && pocValid(poc, nextClient, v) ? poc : "";
    setParams({ client: nextClient, div: v, poc: nextPoc });
  };
  const onPocPick = (v: string) => {
    if (!v) return setParams({ poc: "" });
    const ref = findPoc(v, client, div);
    setParams(ref ? { poc: v, client: ref.client, div: ref.div } : { poc: v });
  };

  // The one list page that had no sort control. Its facets narrow WHICH tickets you see;
  // none of them decide the order, so the newest ticket could sit anywhere on the page.
  const sortOptions = useMemo(
    () => [
      ...commonSorts<Ticket>(
        (t) => t.title,
        (t) => t,
      ),
      {
        key: "priority",
        label: "Priority",
        // By severity, not alphabetically — "Critical, High, Medium, Low" is the order that
        // means something, and A-Z would put Critical after... nothing, but Low before
        // Medium. Newest first within a band, so the top of the list is the freshest crisis.
        compare: (a: Ticket, b: Ticket) =>
          PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority) ||
          (b.createdISO ?? "").localeCompare(a.createdISO ?? ""),
      },
    ],
    [],
  );
  const sortKeys = useMemo(() => sortOptions.map((o) => o.key), [sortOptions]);
  const [sort, setSort] = useStoredSort("tickets", sortKeys, "created");
  const sorted = useMemo(() => applySort(rows, sortOptions, sort), [rows, sortOptions, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageSafe = Math.min(page, totalPages);
  const pageRows = sorted.slice((pageSafe - 1) * pageSize, pageSafe * pageSize);

  // ---- faceted filter bar ----
  const facetOpts: FacetOpts = {
    product: productOpts,
    client: clientOpts,
    division: divisionOpts,
    poc: pocOpts,
    type: typeOpts,
    status: statusOpts,
    team: teamOpts,
    member: memberOpts,
    source: sourceOpts,
    priority: priorityOpts,
    month: monthOpts,
    year: yearOpts,
  };
  const { facets, context } = buildFacets({
    role: session?.manage ? "manager" : "agent",
    opts: facetOpts,
    handlers: { onProductPick, onClientPick, onDivisionPick, onPocPick },
    view: { mine, teamq, astate },
    myTeams: session?.teams ?? [],
    myTeamMembers,
  });
  // Predicate-only filters (dashboard funnels / global search) → clear-only context chips.
  if (q)
    context.push({ key: "q", label: "Search", value: `"${q.trim()}"`, onRemove: () => setParam("q", "") });
  if (sla) context.push({ key: "sla", value: "SLA at risk", onRemove: () => setParam("sla", "") });
  // Same class as sla/attention: arrived from a dashboard tile, and must be removable.
  // It used to be pushed by buildFacets with no onRemove, so it filtered the list with an
  // X-less chip — visible, but nothing short of Clear all would drop it.
  if (astate)
    context.push({
      key: "astate",
      label: "Assignment",
      value: ASTATE_LABELS[astate] ?? astate,
      onRemove: () => setParam("astate", ""),
    });
  if (attention)
    context.push({ key: "attention", value: "Needs attention", onRemove: () => setParam("attention", "") });

  const values: Record<string, string> = {
    product: impliedProduct,
    client: client ?? "",
    div: div ?? "",
    poc: poc ?? "",
    type: type ?? "",
    status: status ?? "",
    priority: priority ?? "",
    source: source ?? "",
    group: group ?? "",
    assignee: assignee ?? "",
    month: month ?? "",
    year: year ?? "",
  };

  const bucket = {
    options: [
      { key: "all", label: "All" },
      { key: "open", label: "Open" },
      { key: "resolved", label: "Resolved" },
    ],
    value: active ? "open" : resolved ? "resolved" : "all",
    onChange: (k: string) =>
      setParams({ active: k === "open" ? "1" : "", resolved: k === "resolved" ? "1" : "", status: "" }),
    ariaLabel: "Status bucket",
  };

  // Picking an exact Status clears the coarse bucket, and vice-versa (no empty-result clash).
  const onFacetChange = (key: string, value: string) => {
    if (key === "status" && value) setParams({ status: value, active: "", resolved: "" });
    else setParam(key, value);
  };
  const onFacetClear = (keys: string[]) => {
    const next = new URLSearchParams(sp.toString());
    keys.forEach((k) => next.delete(k));
    const qs = next.toString();
    router.push(qs ? `/tickets?${qs}` : "/tickets");
  };

  return (
    <>
      <div className="page-head">
        <BackButton />
        <div>
          <h1>Tickets</h1>
          <p>
            {product && client
              ? `Requests for ${client} (${product}) — filter and assign.`
              : product
                ? `Requests for ${product} clients — filter and assign.`
                : client
                  ? `Requests for ${client} — filter and assign.`
                  : "Every request across all clients — filter and assign."}
          </p>
        </div>
        <div className="head-controls">
          <Button variant="primary" icon={<Icon name="plus" size={16} />} onClick={() => setShowNew(true)}>
            New ticket
          </Button>
        </div>
      </div>

      {/* This page's own search. It used to live in the Topbar, where it was the only way
          to set `q` — a single box that searched tickets no matter which section you were
          looking at, and navigated you off that section to do it. */}
      <div className="tickets-search">
        <SearchInput
          value={q ?? ""}
          onChange={setSearch}
          placeholder="Search tickets…"
          ariaLabel="Search tickets by subject, client or contact"
        />
        <SortMenu options={sortOptions} value={sort} onChange={setSort} />
      </div>

      <FacetBar
        bucket={bucket}
        context={context}
        facets={facets}
        values={values}
        onChange={onFacetChange}
        onClear={onFacetClear}
        onClearAll={() => router.push(sp.get("from") ? `/tickets?from=${enc(sp.get("from")!)}` : "/tickets")}
        count={rows.length}
        unit="ticket"
      />

      {/* Filters run over what was fetched, so a silent cap would quietly narrow a
          search without the searcher knowing. */}
      <TruncationNotice what="filters apply only to these" />

      <div className="card">
        <div className="table-wrap">
          <TicketTable
            tickets={pageRows}
            unread={unread}
            onOpen={openTicket}
            empty={<EmptyState>No tickets match these filters.</EmptyState>}
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
