# eu-regulations-mcp — chassis-conformant entry (Phase 5 migration).
#
# Pre-migration this MCP shipped a custom node:24-alpine + tsx runtime.
# Phase 5 moves to the canonical chassis pattern:
#   - FROM ghcr.io/ansvar-systems/mcp-base:vX.Y.Z-alpine
#   - manifest.json declares chassis opt-ins (recitals, guidance, definitions,
#     version_tracking) — chassis serves the corresponding tool sets
#   - Schema-shape regulations.db (32 MB) is COPYed into the image
#   - License-catalog signature + digest live in chassis-catalog/, verified
#     by Gate 3 at startup
#
# Phase 5.B addition (this build): 5 EU-local tools reintroduced via the
# chassis extensionHandlers API (mcp-base v0.1.26+). These tools query
# EU-local tables preserved during the Phase 5.A schema migration. A
# multi-stage build compiles src/chassis-bootstrap.ts + src/extension-handlers/
# to JS, the chassis ENTRYPOINT is overridden to run the bootstrap which
# dynamic-imports chassis serve() and registers the extensionHandlers Map.
#
# Drop-in compose compatibility (Phase 5.A finishing fixup):
# This MCP is a standalone repo (not part of ansvar-mcp-fleet). The prod
# compose entry was authored for the legacy image (container port 3000,
# DB baked-in, no volume mount). To let Watchtower swap legacy → chassis
# transparently, this Dockerfile bakes the DB into the image and uses port
# 3000 for the combined health + MCP transport. The fleet monorepo's
# bind-mount pattern is intentionally NOT adopted here.
#
# Build context: this Dockerfile expects the eu-regulations-mcp repo root
# as build context.
#
# Build: docker build -t eu-regulations-mcp .
# Run:   docker run -p 8300:3000 eu-regulations-mcp

# ────────────────────────────────────────────────────────────────────────────
# Stage 1: builder — compile bootstrap + extension handlers
# ────────────────────────────────────────────────────────────────────────────
# Pinned to match chassis Node version (v20.20.x at v1.1.0). Newer Node would
# produce JS the chassis runtime might not parse — match major version.
FROM node:20-alpine AS builder

WORKDIR /build

# Bootstrap + extension handlers have ZERO external runtime deps (Node stdlib
# only + a local types module mirroring chassis types). Install ONLY
# typescript + @types/node — the repo's own package.json deps (pg, pdfjs-dist,
# cheerio, …) are ingest-script tooling and never reach the image.
RUN echo '{"name":"phase-5b-bootstrap-build","version":"0.0.0","private":true}' > package.json \
  && npm install typescript@5.3.3 @types/node@20.10.5 --no-audit --no-fund

# Source needed for compile. tsconfig.bootstrap.json narrows tsc to ONLY
# src/chassis-bootstrap.ts + src/extension-handlers/** — the only code this
# image runs. (The legacy pre-chassis runtime was deleted in the Phase 5.C
# cleanup; src/utils/ remains for ingest scripts but is not compiled here.)
COPY tsconfig.bootstrap.json ./tsconfig.json
COPY src/chassis-bootstrap.ts src/
COPY src/extension-handlers/ src/extension-handlers/

RUN ./node_modules/.bin/tsc -p tsconfig.json

# ────────────────────────────────────────────────────────────────────────────
# Stage 2: chassis runtime
# ────────────────────────────────────────────────────────────────────────────
# mcp-base v1.2.0 — adds the dead-FTS-index boot gates (fts_index_built
# auto-injected for content_fts/recitals_fts/guidance_sections_fts +
# fts_match_min) that this corpus's silently-dead search_recitals motivated.
# v1.1.1 deltas retained: per-recital source_url; optional version_label.
FROM ghcr.io/ansvar-systems/mcp-base:v1.2.0-alpine

WORKDIR /app

# Manifest + chassis-catalog (Gate 0, Gate 3 inputs).
COPY --chown=ansvar:ansvar manifest.json ./
COPY --chown=ansvar:ansvar chassis-catalog/license-catalog.json chassis-catalog/license-catalog.json.bundle ./

# Schema-shape regulations.db (32 MB) baked into the image. Built locally via
# `npm run build:db` and committed to the repo (see .gitattributes). Image
# remains self-contained for Watchtower swap; no volume mount required in
# prod compose. The chassis verifies the DB at startup (Gate 5 / Gate 9);
# if the DB is missing or the wrong shape, the container fails fast.
COPY --chown=ansvar:ansvar data/regulations.db /app/data/regulations.db

# Regulation analysis guides (filesystem-based, used by get_regulation_guide
# extension handler). Read at request time from /app/data/guides/{REG}.json.
COPY --chown=ansvar:ansvar data/guides/ /app/data/guides/

# Phase 5.B: built bootstrap + extension handlers from builder stage. The
# chassis ENTRYPOINT (`node ./dist/cli.js --serve`) is overridden below to
# run our bootstrap which dynamic-imports chassis serve() with the
# extensionHandlers Map registered.
COPY --from=builder --chown=ansvar:ansvar /build/extension-build/ /app/extension-build/

# Catalog SHA in env. The chassis license-catalog gate (Gate 3b) expects
# this with the explicit "sha256:" prefix to match its internal digest
# representation; without the prefix the gate fails with
# LICENSE_CATALOG_DIGEST_MISMATCH even when the underlying hash matches.
ARG CATALOG_SHA=04a1a5b678ba89e41aa436437288851cd429330d3f8c86a82ea523cfdba5aa82

# Port 3000 matches the legacy compose entry's container port + the
# x-mcp-defaults healthcheck in /opt/ansvar/prod/mcp/docker-compose.yml.
ENV MCP_HEALTH_PORT=3000 \
    MCP_DB_PATH=/app/data/regulations.db \
    MCP_MANIFEST_PATH=/app/manifest.json \
    MCP_CATALOG_PATH=/app/license-catalog.json \
    MCP_CATALOG_SHA=sha256:${CATALOG_SHA}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:3000/health || exit 1

# Phase 5.B ENTRYPOINT override: run the bootstrap which dynamic-imports
# chassis serve() and passes the extensionHandlers Map. tini stays as PID 1
# for proper signal handling (chassis pattern).
ENTRYPOINT ["/sbin/tini", "--", "node", "/app/extension-build/chassis-bootstrap.js"]
