# Inventive Helpdesk — Frontend

The web frontend for **Inventive Helpdesk**, the after-sales support & ticketing platform for
**Inventive Business Solutions Pvt Ltd**. Engineering clients raise **Bug, Query, Improvement and
New-Feature** requests through a division-scoped client portal; the Inventive team triages, assigns,
and resolves them from an admin workspace.

It talks to a headless **Frappe Framework v16** backend (app: `inventive_helpdesk_backend`) over
Frappe's REST + whitelisted-method APIs, using Frappe's own session-cookie authentication.

---

## Tech stack

- **[Next.js 16](https://nextjs.org)** (App Router, Turbopack) + **React 19** + **TypeScript 6**
- **[Zustand 5](https://github.com/pmndrs/zustand)** — typed state store
- **`socket.io-client`** — live ticket updates over Frappe's Socket.IO layer
- **ESLint 9** (flat config) + **Prettier 3** — lint & format
- **Vitest 4** — unit tests
- Hand-rolled CSS design system (`app/globals.css`) — no UI framework

### Frappe integration

The Next server proxies a fixed allowlist of endpoints under `/api/frappe/*` to Frappe
(see `next.config.mjs`), so the browser only ever calls **same-origin** and the Frappe session
cookie (`sid`) is carried automatically — no CORS, no cross-site cookies, no token juggling.
Whitelisted server methods live under the `inventive_helpdesk_backend.*` Python module path
(e.g. `inventive_helpdesk_backend.api.me`). See [`docs/BACKEND-NOTES.md`](docs/BACKEND-NOTES.md)
for the full frontend↔backend contract.

---

## Getting started

Prerequisites: **Node.js ≥ 20**, npm, and a running Frappe v16 backend (`inventive_helpdesk_backend`).

```bash
cp .env.example .env      # point FRAPPE_URL / SOCKETIO_URL at your backend
npm install
npm run dev
```

Open **http://localhost:5175**.

### Environment

| Variable                      | Purpose                                                                                                                                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FRAPPE_URL`                  | Base URL of the Frappe backend the Next server proxies to. Server-side only, never exposed to the browser. **Required in production**; defaults to `http://127.0.0.1:8000` in dev.                     |
| `SOCKETIO_URL`                | Base URL of Frappe's Socket.IO server (realtime). Server-side only. Defaults to `http://127.0.0.1:9000` (Frappe's dev socketio port). In production, point at the host nginx serves `/socket.io` from. |
| `NEXT_PUBLIC_ENABLE_SIMULATE` | Set to `1` to show the admin "Simulate inbound email" dev tool. Hidden in production by default.                                                                                                       |

### Scripts

| Script                 | Does                                       |
| ---------------------- | ------------------------------------------ |
| `npm run dev`          | Dev server on port 5175 (hot reload)       |
| `npm run build`        | Production build (`next build`, Turbopack) |
| `npm start`            | Serve the production build on port 5175    |
| `npm run lint`         | ESLint (flat config)                       |
| `npm run typecheck`    | `tsc --noEmit`                             |
| `npm run format`       | Prettier — write                           |
| `npm run format:check` | Prettier — check only                      |
| `npm test`             | Vitest suite (single run)                  |
| `npm run test:watch`   | Vitest in watch mode                       |

---

## What's inside

**Admin workspace** — Dashboard (KPI tiles with trend deltas, Created-vs-Resolved time series,
breakdowns by status / priority / type / client, team workload, "needs attention" queue) ·
Tickets (filterable table; detail view with a client-visible conversation separate from internal
work notes, attachments, collaborators, inline status / priority / assignee controls) · Clients,
divisions & products · Contacts (POC directory) · Team & Groups (team-first assignment) · Products.

**Client portal** — scoped to the signed-in POC's division: raise tickets, track status, reply.
Internal work notes and team assignment are never exposed to clients.

**Agent workspace** — a scoped dashboard showing only the tickets assigned to the signed-in member
or their group.

### Access model

Three roles, assigned automatically on invite; tenant isolation and work-note visibility are
enforced **server-side by Frappe permissions**, not by the client:

| Role       | Scope                                                     |
| ---------- | --------------------------------------------------------- |
| **Owner**  | Everything — all clients, tickets, team, settings         |
| **Member** | The Inventive workspace, scoped to assigned/group tickets |
| **POC**    | Client portal only, scoped to their division              |

Invited users activate via `/set-password`; removing a Team Member or POC disables their backend login.

### Data model (Frappe DocTypes)

```
Client ──1:1── Product        (shared across the client's divisions)
Client ──1:*── Division ──0..1── POC
Support Ticket  belongs to a Division (⇒ Client ⇒ Product); typed Bug/Query/Improvement/New Feature
Support Ticket  has: conversation (Ticket Message, client-visible) + notes (Work Note, internal)
                     + collaborators (Ticket Collaborator), attachments, assignee, assignment group
```

---

## Project structure

```
app/                      App Router
├─ layout.tsx             root layout (fonts + ToastProvider)
├─ login/                 sign-in
├─ set-password/          invite activation
└─ (app)/                 authenticated shell (sidebar + topbar)
   ├─ page.tsx            dashboard
   ├─ tickets/            list + [id] detail
   ├─ clients/  contacts/ clients, divisions & POC directory
   ├─ team/  groups/      team & assignment
   ├─ products/           products
   └─ portal/             client portal + tickets/[id] detail
components/               ui · layout · modals · dashboard · pages
lib/                      frappe client, auth, realtime, helpers
tests/                    vitest suite
proxy.ts                 route guard (Next 16 proxy convention, formerly middleware.ts)
store.ts                 Zustand store
types.ts                 domain model
next.config.mjs          same-origin Frappe proxy + security headers
app/globals.css          design system
docs/BACKEND-NOTES.md    frontend↔backend API contract
```

---

## Branching

- **`master`** — production, release-ready (default branch)
- **`development`** — integration branch; features merge here first, then into `master`

---

© 2026 Inventive Business Solutions Pvt Ltd.
