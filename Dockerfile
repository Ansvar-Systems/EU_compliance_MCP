# eu-regulations-mcp — chassis-conformant entry (Phase 5 migration).
#
# Pre-migration this MCP shipped a custom node:24-alpine + tsx runtime.
# Phase 5 moves to the canonical chassis pattern:
#   - FROM ghcr.io/ansvar-systems/mcp-base:vX.Y.Z-alpine
#   - manifest.json declares chassis opt-ins (recitals, guidance, definitions,
#     version_tracking) — chassis serves the corresponding tool sets
#   - Schema-shape regulations.db is volume-mounted at /app/data/regulations.db
#   - License-catalog signature + digest live in chassis-catalog/, verified
#     by Gate 3 at startup
#
# Build context: this Dockerfile expects the eu-regulations-mcp repo root
# as build context.
#
# Build: docker build -t eu-regulations-mcp .
# Run:   docker run -v $(pwd)/data:/app/data -p 8300:8300 eu-regulations-mcp

# Requires mcp-base v0.1.28+ — earlier releases reject the four chassis
# opt-in flags at Gate 0 (schema validation) even though the chassis runtime
# supports them. See mcp-base PR #39.
FROM ghcr.io/ansvar-systems/mcp-base:v0.1.28-alpine

WORKDIR /app

# Manifest + chassis-catalog (Gate 0, Gate 3 inputs).
COPY --chown=ansvar:ansvar manifest.json ./
COPY --chown=ansvar:ansvar chassis-catalog/license-catalog.json chassis-catalog/license-catalog.json.bundle ./

# The data/ directory is expected to be a docker-compose bind-mount providing
# a chassis-shape regulations.db (built by scripts/build-db.ts). The chassis
# verifies the DB exists at startup (Gate 5 / Gate 9); if the mount is missing
# or the DB is the wrong shape, the container fails fast with a clear message
# rather than serving a broken corpus.

# Catalog SHA in env. The chassis license-catalog gate (Gate 3b) expects
# this with the explicit "sha256:" prefix to match its internal digest
# representation; without the prefix the gate fails with
# LICENSE_CATALOG_DIGEST_MISMATCH even when the underlying hash matches.
ARG CATALOG_SHA=04a1a5b678ba89e41aa436437288851cd429330d3f8c86a82ea523cfdba5aa82

ENV MCP_HEALTH_PORT=8300 \
    MCP_DB_PATH=/app/data/regulations.db \
    MCP_MANIFEST_PATH=/app/manifest.json \
    MCP_CATALOG_PATH=/app/license-catalog.json \
    MCP_CATALOG_SHA=sha256:${CATALOG_SHA}

EXPOSE 8300

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -q -O- http://127.0.0.1:8300/health || exit 1

# Chassis ENTRYPOINT (inherited from FROM mcp-base) runs `node ./dist/cli.js --serve`.
# No per-MCP entrypoint override needed for Phase 5 — all customer-facing
# tools are chassis-standard (search_legislation, get_provision, get_recital,
# search_guidance, get_definition, etc.). The 5 EU-local tools
# (compare_requirements / map_controls / get_evidence_requirements /
# regulation_guide / check_applicability) are deferred to Phase 5.B, where
# they ride the extensionHandlers API (mcp-base v0.1.26 Phase 4d) via a
# custom entrypoint script.
