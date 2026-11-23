# syntax=docker/dockerfile:1
# Node 24: the database uses the built-in node:sqlite, which needs Node 22.13 or newer.
ARG NODE=node:24-bookworm-slim

FROM ${NODE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM ${NODE} AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 HOUSEY_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM ${NODE} AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    HOUSEY_DB_PATH=/data/housey.db HOUSEY_SITE_CACHE=/data/site-cache
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# The entrypoint maps Home Assistant add-on options to environment variables, then starts the server (docs/home-assistant.md).
COPY --chmod=755 docker-entrypoint.sh ./
COPY scripts/addon-env.mjs ./scripts/
# The named volume copies this folder's ownership on first use, so the unprivileged user can write the database.
RUN mkdir /data && chown node:node /data
VOLUME /data
# No USER line: the entrypoint starts as root, fixes /data ownership and drops to the node user (it stays root only as a Home Assistant add-on).
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["/app/docker-entrypoint.sh"]
