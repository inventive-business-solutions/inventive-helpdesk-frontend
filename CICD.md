# CI/CD — Inventive Helpdesk Frontend

Next.js app deployed on Docker Swarm via Portainer CE, behind Traefik, on the same
x86_64 node as the Frappe backend.

> **Scope:** this pipeline deploys the **Next.js frontend only**. The Frappe backend is a
> separate stack, deployed from `inventive-helpdesk-backend`.

---

## Hosts

| Host                                   | Serves           | Deployed by                  |
| -------------------------------------- | ---------------- | ---------------------------- |
| `helpdesk.inventivebizsol.co.in`       | Next.js frontend | this repo                    |
| `helpdeskfrappe.inventivebizsol.co.in` | Frappe backend   | `inventive-helpdesk-backend` |

Both resolve to `43.242.225.160`. Traefik routes by Host header and issues TLS via the
`le` certresolver, so certificates are automatic.

---

## How the frontend reaches the backend

The browser only ever talks to `helpdesk.inventivebizsol.co.in`. The Next server proxies a
fixed allowlist of paths to Frappe (see `next.config.mjs`), so every request is same-origin
and Frappe's `sid` cookie is carried with no CORS and no cross-site cookies.

```
browser ──https──> Traefik ──> Next (:3000) ──https──> Traefik ──> Frappe nginx (:8080)
   helpdesk.inventivebizsol.co.in            helpdeskfrappe.inventivebizsol.co.in
```

The hop back out through Traefik rather than straight across the overlay network is
deliberate. Frappe resolves which site to serve from the **Host header**
(`FRAPPE_SITE_NAME_HEADER: $host` in the backend stack). Calling the backend service
directly by its Swarm name would send `Host: backend`, which matches no site.

### These URLs are baked in at build time

`rewrites()` runs during `next build` and is frozen into `.next/routes-manifest.json`. The
production server reads that manifest and **never re-evaluates `next.config.mjs`**.

Consequences, all of which have a way of looking like something else:

- `FRAPPE_URL` / `SOCKETIO_URL` must be passed as **Docker build args**. Setting them only
  as container environment does nothing — the app boots cleanly and then fails every
  backend call with `EAI_AGAIN` against whatever was baked in.
- Repointing at a different backend requires a **rebuild**, not a stack variable change.
- The Dockerfile therefore _requires_ both build args and aborts if either is empty,
  rather than silently shipping an image wired to `127.0.0.1`.

`FRAPPE_URL` is also set on the container, where it is read at runtime by `/api/health`
only. The image records what it was built against as `FRAPPE_URL_BUILT`; if the two
disagree, `/api/health` returns `status: "degraded"` with an explicit `checks.config`
error instead of leaving you to work it out from a 502.

### Realtime

`/socket.io` is proxied the same way. Two non-obvious things keep it working, both in
`next.config.mjs`:

- Engine.IO always requests `/socket.io/?EIO=4&...` — trailing slash, no path segments.
  Next normalises that away before rewrite matching, and a `:path*` destination renders
  the empty segment as nothing, so the proxy asks Frappe for `/socket.io`. Frappe's
  socket.io server does not answer that path; it resets the connection. Hence the exact
  `{ source: "/socket.io", destination: ".../socket.io/" }` rule, which restores the slash.
- `skipTrailingSlashRedirect: true` stops Next answering the client's `/socket.io/` with a
  308 to the slashless form, which would otherwise cost an extra round trip on every poll.

Both failures are silent: the socket never connects and the app falls back to its 30s
poller, so the only symptom is that updates feel slow. If realtime seems dead, check
`curl https://helpdesk.inventivebizsol.co.in/socket.io/?EIO=4&transport=polling` — a
healthy response starts `0{"sid":"..."`.

WebSocket _upgrade_ does not survive a Next rewrite, so the transport stays on HTTP
long-polling. Updates still arrive in about a second.

---

## Architecture

**Branch flow:** day-to-day work is committed to `development`. Releases are made by
merging `development` → `master`, which is the branch the hosted environment tracks.

```
merge development -> master  (release)
       │
       ▼
GitHub Actions (self-hosted, inventive-microscan)
       ├── lint, typecheck, unit tests
       ├── docker build (linux/amd64), FRAPPE_URL + SOCKETIO_URL + BUILD_SHA baked in
       ├── push to GHCR (:<sha> and :latest)
       ├── POST the Portainer webhook
       └── poll /api/health until it reports this commit's SHA
       ▼
Docker Swarm redeploys the stack
```

**The stack's `VERSION` must be `latest`.** This is the single setting the whole deploy
chain depends on, and getting it wrong fails silently.

The webhook available on Community Edition only redeploys the stack — it does not set
environment variables (a `?VERSION=` query parameter is accepted and then ignored), and it
cannot force an image pull, since _Re-pull image_ and _Force redeployment_ are Business
features.

What makes it work anyway: `docker stack deploy` re-resolves an image tag to its current
registry digest, so redeploying `:latest` picks up whatever CI last pushed.

Pin `VERSION` to a SHA and every redeploy faithfully reinstalls that same image forever —
the pipeline goes green, the webhook returns 204, the containers restart, and the old code
keeps serving. Every build is also tagged `:<sha>`, so pinning one deliberately is still
how you roll back.

### Why the deploy check compares SHAs

`/api/health` reports the `BUILD_SHA` baked into the image. CI polls until that equals the
commit it just built. A plain HTTP 200 check would be satisfied by the _previous_ container
still serving traffic, which is exactly how a broken deploy passes as green.

The endpoint returns 200 whenever the Next process is alive, even if Frappe is unreachable.
That is deliberate: Swarm restarts a task whose healthcheck fails, so answering 503 during
a backend outage would turn a backend redeploy into a frontend restart loop. Backend
trouble surfaces as `status: "degraded"` in the body, and CI logs a warning rather than
failing the deploy.

---

## Server prerequisites

Already satisfied by the backend deployment — listed for a rebuild:

- Docker Swarm with Portainer CE and Traefik v3
- An external overlay network named `traefik-public`
- Traefik entrypoints `web` (:80) and `websecure` (:443), certresolver `le`
- A self-hosted GitHub Actions runner labelled `inventive-microscan`, x86_64

> Traefik settings here differ from the `comment-management-frontend` repo, which runs
> behind a different, older Traefik: this one needs `traefik.swarm.network` (renamed from
> `traefik.docker.network` in v3) and entrypoints `web`/`websecure` (not `http`/`https`).
> Copying those two labels across gives a 404 served with Traefik's default self-signed
> certificate — a failure that looks like DNS or TLS, not a label typo.

---

## GitHub configuration

Set on the **Production** environment of `inventive-helpdesk-frontend`.

### Variables

| Name              | Value                                                                   |
| ----------------- | ----------------------------------------------------------------------- |
| `IMAGE_NAME`      | `ghcr.io/inventive-business-solutions/prod-inventive-helpdesk-frontend` |
| `FRONTEND_DOMAIN` | `helpdesk.inventivebizsol.co.in`                                        |
| `FRAPPE_URL`      | `https://helpdeskfrappe.inventivebizsol.co.in`                          |
| `SOCKETIO_URL`    | `https://helpdeskfrappe.inventivebizsol.co.in`                          |

`SOCKETIO_URL` is the backend host, not a separate port: Frappe's own nginx serves
`/socket.io` on the same origin it serves the API from.

The pipeline fails fast if any of these is missing, and rejects a non-HTTPS `FRAPPE_URL`.
Without that check an unset `IMAGE_NAME` surfaces several steps later as
`invalid tag ":<sha>": invalid reference format`, and an unset `FRAPPE_URL` produces a
perfectly green run that ships an image pointing at localhost.

### Secrets

| Name                    | Value                                  |
| ----------------------- | -------------------------------------- |
| `PORTAINER_WEBHOOK_URL` | the stack's webhook URL from Portainer |

Copy the webhook URL **after saving** the stack. Copied from the edit form before saving,
it returns `"Unable to find the stack by webhook ID"` on every deploy.

If the secret is absent the pipeline still builds and pushes, logs a notice, and skips the
deploy — which is what you want before the stack exists.

---

## Portainer stack

Create a stack named `inventive-helpdesk-frontend` from this repository, using
`deploy/docker-compose.yml`, on branch `master`. Set the environment variables from
[`deploy/.env.example`](deploy/.env.example), enable the webhook, and save.

Note `FRONTEND_DOMAIN` takes a **plain hostname with no backticks** — the compose file
already wraps it as ``Host(`...`)``. The backend stack's `SITES` variable is the opposite,
because its compose interpolates the value straight into the rule. Do not copy one to the
other.

---

## First deployment

1. Confirm DNS: `helpdesk.inventivebizsol.co.in` → `43.242.225.160`.
2. Push to `master` (or run the workflow manually) to build and push the first image.
   With no webhook secret yet, the run stops after the push.
3. Create the stack in Portainer as above and deploy it.
4. Copy the saved webhook URL into the `PORTAINER_WEBHOOK_URL` secret.
5. Re-run the workflow. It should now build, deploy, and verify the SHA.

Verify:

```bash
curl -s https://helpdesk.inventivebizsol.co.in/api/health
# {"status":"ok","version":"<sha>","checks":{"backend":{"ok":true}}}

curl -s -o /dev/null -w '%{http_code}\n' https://helpdesk.inventivebizsol.co.in/login
# 200

curl -s 'https://helpdesk.inventivebizsol.co.in/socket.io/?EIO=4&transport=polling'
# 0{"sid":"...","upgrades":["websocket"],...}
```

---

## Rollback

Set `VERSION` to the SHA you want in the Portainer stack's environment variables, then
update the stack. Set it back to `latest` afterwards, or the next deploy will silently
reinstall the rolled-back image.

---

## Troubleshooting

| Symptom                                    | Cause                                                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 404 with a self-signed certificate         | Traefik labels wrong — check `traefik.swarm.network` and the `web`/`websecure` entrypoints                         |
| Pipeline green, old code still serving     | `VERSION` pinned to a SHA instead of `latest`                                                                      |
| App loads, every backend call fails        | Image built without `FRAPPE_URL`, or built against the wrong one — check `/api/health` for a `checks.config` error |
| `/api/health` returns `degraded`           | Backend unreachable from the container, or a build/runtime `FRAPPE_URL` mismatch                                   |
| Updates only arrive every 30s              | Socket.IO handshake failing — see [Realtime](#realtime)                                                            |
| Task stuck pending, "unsupported platform" | Image built for the wrong architecture; must be `linux/amd64`                                                      |
| Webhook returns "Unable to find the stack" | URL copied from the edit form before the stack was saved                                                           |

---

## Notes on this pipeline vs the reference

Modelled on the backend's pipeline, which is proven on this server, rather than on
`comment-management-frontend`'s. That repo's pipeline targets a different Traefik and a
different runner, and adds SonarQube, Semgrep, Gitleaks, Trivy, OSV, Cosign and SBOM
stages. Those are worth adopting, but each needs infrastructure (a Sonar host, GHAS or
artifact retention policy) that is not set up for this repo — added blind they would fail
closed and block every deploy.

Quality checks, build and deploy share **one job** on purpose. The runner is
single-executor, so splitting them buys no parallelism, costs a second checkout and
`npm ci`, and opens a window for another run to take the runner between the gate and the
build it was meant to gate.
