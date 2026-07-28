/**
 * Why is this list showing nothing?
 *
 * An empty list has more than one cause, and the causes need opposite messages. "No tickets
 * match these filters" is help when a filter is set and a wild goose chase when none is —
 * the reader goes hunting for a control to clear that was never touched. The failure is
 * always the same shape: the component branches on the list it just finished narrowing,
 * which cannot distinguish "narrowed to nothing" from "there was nothing to narrow".
 *
 * It is easy to get wrong because the wrong version looks right on a populated dev site and
 * only misleads on an empty one — a fresh install, a new tenant, or a site whose data was
 * just cleared. Four components in this app got it wrong that way, including one that told
 * an empty team "everyone is already in this team".
 *
 * Taking `total` as a required argument is the point: you cannot answer the question without
 * the unnarrowed count, so a caller who has not thought about it cannot call this at all.
 */
export type EmptyReason =
  /** The source is empty. Nothing has been created yet — offer the way to create one. */
  | "empty"
  /** Things exist, but the search text excluded them. Echo the query so it can be cleared. */
  | "search"
  /** Things exist and survived the search; some other filter or tab excluded them. */
  | "filtered";

export function emptyReason({
  total,
  afterSearch,
  query,
}: {
  /** Size of the source list BEFORE any narrowing. The whole point of the helper. */
  total: number;
  /** Size after the search is applied but before other filters, where the caller can
   *  separate the two. Omit when the search and the filters are applied together. */
  afterSearch?: number;
  /** The active search text, if any. Only consulted when `afterSearch` is unavailable. */
  query?: string;
}): EmptyReason {
  if (total === 0) return "empty";
  // A caller that can measure the post-search list gets the precise answer. Note this
  // deliberately does not also check `query`: a non-empty query that matched nothing is
  // "search" whether or not the caller passed the text, and an empty query cannot reduce
  // the list to zero, so afterSearch === 0 already implies a query was responsible.
  if (afterSearch !== undefined) return afterSearch === 0 ? "search" : "filtered";
  // Otherwise the best available signal is whether the reader typed anything.
  return query ? "search" : "filtered";
}
