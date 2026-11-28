# syntax=docker/dockerfile:1
# Node 24: the database uses the built-in node:sqlite, which needs Node 22.13 or newer.
ARG NODE=node:24-bookworm-slim
ARG VECTILER_REF=f9bd89e9446a91c26aa26d135646327d9b715e13

# Vectiler (MIT, C++/CMake) renders the 3D city of the Surroundings feature (docs/site.md). Independent of the app sources, so it stays cached.
FROM ${NODE} AS vectiler
ARG VECTILER_REF
RUN apt-get update \
    && apt-get install -y --no-install-recommends cmake g++ make libcurl4-openssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
# Only the three header-only submodules CMakeLists uses (glm, rapidjson, earcut.hpp); non-recursive, so rapidjson's gtest submodule is skipped.
RUN git init -q . \
    && git remote add origin https://github.com/karimnaaji/vectiler.git \
    && git fetch -q --depth 1 origin ${VECTILER_REF} \
    && git checkout -q FETCH_HEAD \
    && git submodule update -q --init --depth 1 3rdparty/glm 3rdparty/rapidjson 3rdparty/earcut.hpp
# The 2017 code predates GCC 12's slimmer standard headers, hence the forced includes.
RUN cmake -S . -B build -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_FLAGS="-include cassert -include algorithm -include cstdint" \
    && cmake --build build -j"$(nproc)" \
    && mkdir /out && strip -o /out/vectiler build/vectiler.out

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
# Vectiler's runtime libraries (libcurl) plus CA certificates for its HTTPS tile fetches.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libcurl4 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=vectiler /out/vectiler /usr/local/bin/vectiler
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
