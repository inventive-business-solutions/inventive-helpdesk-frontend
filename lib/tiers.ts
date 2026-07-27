import type { Session } from "@/types";

/**
 * What each staff tier is called on screen.
 *
 * One definition, because these names appear in the Admin table, its badges, its confirm
 * dialogs, and the signed-in user's card in the sidebar. A name repeated across files is a
 * name that eventually disagrees with itself — the sidebar said "Administrator" for every
 * manager while the Admin page had already started distinguishing the tier that can
 * delegate from the tier that cannot.
 */
export const TIER = {
  owner: "Lead Administrator",
  admin: "Administrator",
  agent: "Agent",
} as const;

/** The tier label for a signed-in staff session. Clients are not staff and have none. */
export function tierLabel(session: Pick<Session, "role" | "manage" | "isOwner">): string | null {
  if (session.role !== "admin") return null;
  if (session.isOwner) return TIER.owner;
  return session.manage ? TIER.admin : TIER.agent;
}
