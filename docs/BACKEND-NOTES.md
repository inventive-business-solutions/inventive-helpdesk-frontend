# Frontend ↔ Frappe backend contract

How this frontend talks to the **`inventive_helpdesk_backend`** Frappe v16 app. Read this before
integrating a new DocType or changing an API call.

## Naming: hyphen vs underscore

- **GitHub repo / app title:** `inventive-helpdesk-backend` / "Inventive Helpdesk" (hyphens/spaces).
- **Python app module:** `inventive_helpdesk_backend` (underscores) — this is `app_name` in the
  backend's `hooks.py`, and it's what every whitelisted method path uses:
  `/api/method/inventive_helpdesk_backend.api.me`. Hyphens are never valid in a call path (they
  aren't valid Python identifiers).

## Same-origin proxy (no CORS, cookie-based auth)

The browser only ever calls **same-origin** `/api/frappe/*`. `next.config.mjs` rewrites an explicit
**allowlist** of endpoints to `FRAPPE_URL` (and `/socket.io` to `SOCKETIO_URL`), so Frappe's `sid`
session cookie rides along automatically. Everything not on the allowlist 404s instead of exposing
Frappe's full method surface (`frappe.client.*`, etc.). Tenant isolation on `/api/resource/*` is
still enforced by Frappe's own permission model.

The client layer is `lib/frappe.ts`; auth helpers are `lib/auth.ts`; the route guard is `proxy.ts`
(Next 16's rename of `middleware.ts`), which bounces sessionless requests to `/login`.

## Authentication (Frappe-native, session cookies)

- **Login:** `POST /api/method/login` (`usr`, `pwd`) → sets `sid` cookie.
- **Logout:** `POST /api/method/logout`.
- **Current user:** `GET /api/method/frappe.auth.get_logged_user`.
- **Session context + CSRF:** `GET /api/method/inventive_helpdesk_backend.api.me` → `{ user, role
(admin|client), manage, member, teams, is_agent, client, division, ... , csrf_token }`.
- **Invite activation / reset:** `frappe.core.doctype.user.user.update_password` /
  `.reset_password`.

No JWT — Frappe's built-in session mechanism is the source of truth. The CSRF token from `me()` is
attached as `X-Frappe-CSRF-Token` to every mutating request.

## Whitelisted methods (allowlist ↔ backend)

Each is proxied in `next.config.mjs` and wrapped in `lib/frappe.ts`. All live in
`inventive_helpdesk_backend/api.py` (or `email.py`) on the backend:

| Frontend wrapper (`lib/frappe.ts`)                           | Backend method                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `me()`                                                       | `api.me`                                                                         |
| `addTicketMessage` / `addTicketNote` / `reopenTicket`        | `api.add_message` / `api.add_note` / `api.reopen`                                |
| `claimTicket`                                                | `api.claim_ticket`                                                               |
| `addCollaborator` / `removeCollaborator`                     | `api.add_collaborator` / `api.remove_collaborator`                               |
| `uploadAttachment`                                           | `api.upload_attachment`                                                          |
| `updateClient` / `updateProduct` / `updatePoc` / `deletePoc` | `api.update_client` / `api.update_product` / `api.update_poc` / `api.delete_poc` |
| `invitePoc` / `inviteMember`                                 | `api.invite_poc` / `api.invite_member`                                           |
| (`store.ts`) `update_member`                                 | `api.update_member`                                                              |
| `sendTestEmail` (dev)                                        | `email.send_test_email`                                                          |

**Adding a new whitelisted method:** add a proxy entry to the `proxyRewrites` allowlist in
`next.config.mjs` (both `source` and `destination`, underscore module path), then a typed wrapper
in `lib/frappe.ts`. Generic REST CRUD (`getList`/`getDoc`/`createDoc`/`updateDoc`/`deleteDoc`) goes
through `/api/resource/:path*`, already allowlisted — no config change needed for a new DocType's
plain reads/writes.

## DocType field contract

`lib/frappe.ts` maps these Frappe fieldnames — keep them in sync if the backend DocTypes change:

- **Support Ticket:** `title, ticket_type, priority, status, client, division, raised_by, assignee,
assignment_group, due_date, sla_risk, source, from_email, description, attachments` + child tables
  `conversation` (Ticket Message), `collaborators` (Ticket Collaborator), `notes` (Work Note).
- **Client:** `client_name, client_code, since, product` · **Division:** `division_name,
division_code, client` · **POC:** `poc_name, email, is_primary, client, division, user, invited_on`.
- **Team Member:** `member_name, email, title, status, user` · **Assignment Group:** `group_name,
members[].member` · **Product:** `product_name`.

## Realtime (Socket.IO)

`lib/realtime.ts` connects same-origin through the `/socket.io` proxy and listens for two events the
backend emits from `inventive_helpdesk_backend/realtime.py` (`publish_ticket_update`, wired to
Support Ticket `on_update` **and** `after_insert` in `hooks.py`):

- **`ticket_update`** → doc room `doc:Support Ticket/<name>` (permission-gated by
  `can_subscribe_doc` → `ticket_has_permission`). Carries `{name, modified}`; the open detail view
  re-fetches that ticket.
- **`ticket_list_dirty`** → doctype room `doctype:Support Ticket` (contentless ping); open list/board
  views refetch their own permission-scoped set.

A 30s poller (`lib/useAutoRefresh.ts`) is the fallback, so a dropped socket never means stale data.

> **Backend change applied during migration:** `publish_ticket_update` was added to Support Ticket
> `after_insert` (previously only `on_update`) so a brand-new ticket pings open list views instantly
> instead of waiting up to 30s for the poller. This edit lives in the **backend** repo
> (`inventive_helpdesk_backend/hooks.py`) and must be committed/deployed there; `bench start`
> auto-reloads it in dev. No schema migration required.
