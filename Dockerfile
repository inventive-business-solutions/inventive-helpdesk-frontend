# Inventive Helpdesk — frontend production image.
#
# Multi-stage: install deps, build the Next standalone bundle, then ship only the
# bundle on a clean base. Targets linux/amd64 (the Swarm node); see CICD.md.

# Pinned rather than :24-alpine so a rebuild of an old commit produces the same image.
ARG NODE_IMAGE=node:24.18-alpine

# ============================================================
# Stage 1 — dependencies
# ============================================================
FROM ${NODE_IMAGE} AS deps

RUN apk upgrade --no-cache && apk add --no-cache libc6-compat

WORKDIR /app

# Copied on their own so this layer is reused whenever only source files change.
COPY package.json package-lock.json ./

RUN npm ci --prefer-offline --no-audit

# ============================================================
# Stage 2 — build
# ============================================================
FROM ${NODE_IMAGE} AS builder

RUN apk upgrade --no-cache

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# next.config.mjs freezes the Frappe proxy destinations into .next/routes-manifest.json
# at build time — the production server reads that manifest and never re-evaluates the
# config. Passing these only as container env is therefore silently ineffective: the app
# would boot cleanly and fail every backend call. They are required build args, and the
# build aborts below rather than baking the localhost defaults into a shipped image.
ARG FRAPPE_URL
ARG SOCKETIO_URL
ARG BUILD_SHA=dev
# Sentry DSN. Build-time for the SAME reason as the two above, in two places at once: a
# NEXT_PUBLIC_ variable is inlined into the client bundle during `next build`, and the DSN's
# origin is compiled into the Content-Security-Policy that next.config.mjs freezes into
# routes-manifest.json. Set only on the running container it would do nothing twice over —
# the browser bundle would carry no DSN, and even a server-side one would be reporting to a
# host the CSP does not allow.
#
# Optional, unlike FRAPPE_URL: an image built without it simply has error reporting off,
# which is a working image. So this gets no guard below.
ARG NEXT_PUBLIC_SENTRY_DSN=

RUN if [ -z "$FRAPPE_URL" ] || [ -z "$SOCKETIO_URL" ]; then \
      echo "ERROR: FRAPPE_URL and SOCKETIO_URL are required build args." >&2; \
      echo "       They are baked into the proxy rewrites and cannot be set at runtime." >&2; \
      exit 1; \
    fi

ENV FRAPPE_URL=${FRAPPE_URL} \
    SOCKETIO_URL=${SOCKETIO_URL} \
    BUILD_SHA=${BUILD_SHA} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# The runner stage copies .next/static and the standalone bundle, but the repo currently
# has no public/ directory, so there is no COPY for one. If public/ is ever added, that
# COPY must be added too — otherwise its assets would 404 in production with nothing to
# explain why. Fail the build loudly at that moment instead.
RUN if [ -d /app/public ]; then \
      echo "ERROR: public/ exists but the runner stage does not copy it." >&2; \
      echo "       Add: COPY --from=builder /app/public ./public" >&2; \
      exit 1; \
    fi

# ============================================================
# Stage 3 — runtime
# ============================================================
FROM ${NODE_IMAGE} AS runner

# dumb-init reaps zombies and forwards SIGTERM, so `docker stack` rolling updates
# stop the server gracefully instead of waiting out the kill timeout.
RUN apk upgrade --no-cache && apk add --no-cache dumb-init

WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# The standalone bundle carries its own minimal node_modules; .next/static and public/
# are excluded from it by design and must be copied alongside.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ARG FRAPPE_URL
ARG BUILD_SHA=dev

# FRAPPE_URL_BUILT records what the bundle was BUILT against. app/api/health reads it at
# runtime and compares it with the container's FRAPPE_URL, so the two drifting apart shows
# up in the health payload rather than as an unexplained 502 in the UI.
ENV NODE_ENV=production \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1 \
    BUILD_SHA=${BUILD_SHA} \
    FRAPPE_URL_BUILT=${FRAPPE_URL}

EXPOSE 3000

# Hits the app's own health route, which stays 200 while this process is alive even if
# the backend is down — a backend outage must not make Swarm restart the frontend.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
