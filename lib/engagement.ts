import type { Client } from "@/types";

/**
 * The divisions to send for a chosen scope.
 *
 * Empty means "attached to the client as a whole" — that is how the backend reads an
 * engagement with no division rows, and it is a real state, not missing data.
 *
 * The value therefore comes from the scope CHOICE, never from whatever is currently
 * ticked. Reading the checklist directly would mean switching back to client-wide silently
 * kept the divisions selected before the switch, saving a scoped engagement while the
 * dialog said client-wide. A client with no divisions is always client-wide, whatever the
 * toggle happens to say.
 */
export const scopedDivisions = (
  scope: "client" | "divisions",
  client: Client | undefined,
  divisions: string[],
): string[] => (scope === "client" || !(client?.divisions ?? []).length ? [] : divisions);
