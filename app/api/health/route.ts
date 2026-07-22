import { NextResponse } from "next/server";

/**
 * Liveness + deploy-verification endpoint.
 *
 * `version` is the git SHA baked in at image build (Dockerfile `BUILD_SHA` arg). CI polls
 * it after triggering a deploy: a plain 200 would be satisfied by the *previous* container
 * still serving traffic, so the SHA is what actually proves the new image is live.
 *
 * Always returns HTTP 200 while this process is up, even when the backend is unreachable.
 * This is a liveness probe, and Swarm restarts a task whose healthcheck fails — returning
 * 503 on backend trouble would turn a backend redeploy into a frontend restart loop.
 * Backend reachability is still reported, as `status: "degraded"` plus `checks.backend`.
 */

// Belt-and-braces. GET route handlers have been dynamic by DEFAULT since Next 15 (this
// used to say the opposite, which was true of Next 14), and the handler additionally
// fetches with `cache: "no-store"` and reads process.uptime(), neither of which is
// prerenderable. Kept as an explicit statement of intent for a liveness probe.
export const dynamic = "force-dynamic";

const FRAPPE_URL = process.env.FRAPPE_URL || "http://127.0.0.1:8000";
const BACKEND_HEALTH = `${FRAPPE_URL}/api/method/inventive_helpdesk_backend.health.check`;

export async function GET() {
  let backend: { ok: true } | { ok: false; error: string };
  try {
    const res = await fetch(BACKEND_HEALTH, {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    backend = res.ok ? { ok: true } : { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    backend = { ok: false, error: err instanceof Error ? err.message : "unreachable" };
  }

  // The proxy destinations in next.config.mjs are frozen at build time, while this handler
  // reads FRAPPE_URL at runtime. If the two ever disagree the app proxies to one backend
  // and health-checks another — invisible unless we say so. Surfacing both makes that
  // mismatch obvious in the health payload instead of a mystery 502 in the UI.
  const builtAgainst = process.env.FRAPPE_URL_BUILT;
  const backendMismatch = Boolean(builtAgainst) && builtAgainst !== FRAPPE_URL;

  return NextResponse.json({
    status: backend.ok && !backendMismatch ? "ok" : "degraded",
    version: process.env.BUILD_SHA || "dev",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    checks: {
      backend,
      ...(backendMismatch
        ? { config: { ok: false, error: `built against ${builtAgainst}, running with ${FRAPPE_URL}` } }
        : {}),
    },
  });
}
