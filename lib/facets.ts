import type { SelectOption } from "@/components/ui/Select";
import type { IconName } from "@/components/ui/Icon";

/** One filterable dimension. Value options exclude the "All …" reset row (a pill exists
 *  only when a value is set; removing it clears the value). `onPick` overrides the default
 *  `onChange` — used by the Product→Client→Division→POC cascade to keep its back-fill/drop
 *  behavior. `group` collapses same-group facets to a single (deepest-set) pill. */
export interface Facet {
  key: string;
  label: string;
  options: SelectOption[];
  icon?: IconName;
  onPick?: (value: string) => void;
  group?: string;
  clearKeys?: string[];
  formatValue?: (value: string) => string;
}

/** A small glyph per dimension, shown in the Add-filter menu and on each pill. */
const FACET_ICON: Record<string, IconName> = {
  product: "box",
  client: "clients",
  div: "projects",
  poc: "user",
  type: "tickets",
  status: "info",
  priority: "alert",
  source: "mail",
  group: "grid",
  assignee: "user",
  month: "clock",
  year: "clock",
};

/** A non-editable scope/view chip (or a clear-only chip when `onRemove` is set). */
export interface ContextChip {
  key: string;
  label?: string;
  value: string;
  onRemove?: () => void;
}

export type FacetRole = "manager" | "agent" | "client";

/** Pre-built option lists (already cascade-narrowed by the page) keyed by facet. Each
 *  includes its leading "All …" row, which `buildFacets` strips. */
export interface FacetOpts {
  product: SelectOption[];
  client: SelectOption[];
  division: SelectOption[];
  poc: SelectOption[];
  type: SelectOption[];
  status: SelectOption[];
  team: SelectOption[];
  member: SelectOption[];
  source: SelectOption[];
  priority: SelectOption[];
  month: SelectOption[];
  year: SelectOption[];
}

interface BuildCtx {
  role: FacetRole;
  opts: FacetOpts;
  handlers?: {
    onProductPick?: (v: string) => void;
    onClientPick?: (v: string) => void;
    onDivisionPick?: (v: string) => void;
    onPocPick?: (v: string) => void;
  };
  scope?: { product?: string | null; client?: string | null };
  view?: { mine?: string | null; teamq?: string | null; astate?: string | null };
  /** Agent only: limit the Team facet to the member's own teams. */
  myTeams?: string[];
  /** Agent only: limit the Member facet to people in the member's own teams. */
  myTeamMembers?: string[];
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const monthFmt = (v: string) => MONTH_NAMES[Number(v) - 1] ?? v;
const sourceFmt = (v: string) =>
  v === "Email" ? "Raised by email" : v === "Portal" ? "Raised in portal" : v;
const teamFmt = (v: string) => (v === "none" ? "No team" : v);

const MINE_LABELS: Record<string, string> = {
  me: "Assigned to me",
  triage: "Triage inbox",
  collab: "Collaborating",
};
const ASTATE_LABELS: Record<string, string> = {
  unassigned: "Unassigned",
  team: "Awaiting member",
  member: "Assigned",
};

/** Drop the leading "All …" reset row — facet menus list real values only. */
const vals = (o: SelectOption[]) => o.filter((x) => x.value !== "");

/** Build the role- and section-appropriate facet list (+ context chips). */
export function buildFacets(ctx: BuildCtx): { facets: Facet[]; context: ContextChip[] } {
  const { role, opts, handlers, scope, view, myTeams, myTeamMembers } = ctx;
  const facets: Facet[] = [];
  const context: ContextChip[] = [];

  const inTeamq = !!view?.teamq;
  const inTriage = view?.mine === "triage";

  // --- hierarchical cascade (staff — managers AND agents) ---
  // Agents see a scoped ticket set, but can still narrow it by product/client/division/POC
  // (e.g. "tickets from EniMAX · Thermax · Heating"). Locked only when arriving scoped.
  if (role !== "client") {
    if (scope?.product) context.push({ key: "product", label: "Product", value: scope.product });
    else
      facets.push({
        key: "product",
        label: "Product",
        group: "hier",
        options: vals(opts.product),
        onPick: handlers?.onProductPick,
      });

    if (scope?.client) context.push({ key: "client", label: "Client", value: scope.client });
    else
      facets.push({
        key: "client",
        label: "Client",
        group: "hier",
        options: vals(opts.client),
        onPick: handlers?.onClientPick,
        clearKeys: ["div", "poc"],
      });

    facets.push({
      key: "div",
      label: "Division",
      group: "hier",
      options: vals(opts.division),
      onPick: handlers?.onDivisionPick,
      clearKeys: ["poc"],
    });
    facets.push({
      key: "poc",
      label: "POC",
      group: "hier",
      options: vals(opts.poc),
      onPick: handlers?.onPocPick,
    });
  } else if (vals(opts.product).length) {
    facets.push({ key: "product", label: "Product", options: vals(opts.product) });
  }

  // --- common to all roles ---
  facets.push({ key: "type", label: "Type", options: vals(opts.type) });
  facets.push({ key: "status", label: "Status", options: vals(opts.status) });
  facets.push({ key: "source", label: "Source", options: vals(opts.source), formatValue: sourceFmt });

  // Priority — staff only.
  if (role !== "client") facets.push({ key: "priority", label: "Priority", options: vals(opts.priority) });

  // Team — manager (all) / agent (own teams only). Hidden in triage / a fixed team queue.
  if (!inTeamq && !inTriage) {
    if (role === "manager") {
      facets.push({ key: "group", label: "Team", options: vals(opts.team), formatValue: teamFmt });
    } else if (role === "agent") {
      const own = new Set(myTeams ?? []);
      const teamOpts = vals(opts.team).filter((o) => own.has(o.value));
      if (teamOpts.length) facets.push({ key: "group", label: "Team", options: teamOpts });
    }
  }

  // Member (assignee) — managers see everyone; agents see people in their own teams (so they
  // can check what teammates are working on). Hidden in a team queue (a queue is unassigned).
  if (!inTeamq) {
    if (role === "manager") {
      facets.push({ key: "assignee", label: "Member", options: vals(opts.member) });
    } else if (role === "agent") {
      const mates = new Set(myTeamMembers ?? []);
      const memberVals = vals(opts.member).filter((o) => o.value === "Unassigned" || mates.has(o.value));
      if (memberVals.length) facets.push({ key: "assignee", label: "Member", options: memberVals });
    }
  }

  // Date — all roles.
  facets.push({ key: "month", label: "Month", options: vals(opts.month), formatValue: monthFmt });
  facets.push({ key: "year", label: "Year", options: vals(opts.year) });

  // --- view context chips (sidebar / dashboard driven) ---
  if (view?.teamq) context.push({ key: "teamq", label: "Team queue", value: view.teamq });
  if (view?.mine) context.push({ key: "mine", label: "View", value: MINE_LABELS[view.mine] ?? view.mine });
  if (view?.astate)
    context.push({ key: "astate", label: "Assignment", value: ASTATE_LABELS[view.astate] ?? view.astate });

  for (const f of facets) f.icon = FACET_ICON[f.key];
  return { facets, context };
}
