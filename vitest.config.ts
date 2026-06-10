import { defineConfig } from 'vitest/config';

// Phase 5.C legacy retirement (2026-06-10): the pre-chassis runtime
// (src/tools/, src/database/, src/index.ts, src/http-server.ts, src/worker.ts)
// and its test tree are deleted. The customer-facing MCP surface is served by
// the @ansvar/mcp-base chassis (Dockerfile FROM-image, v1.1.0) and tested in
// mcp-base's own suite + the docker e2e drive documented in the PR.
//
// What this repo still tests:
//   - tests/extensions/  — the 5 EU-local extension handlers (compare_requirements,
//     map_controls, get_evidence_requirements, get_regulation_guide,
//     check_applicability) against the real chassis-shape data/regulations.db
//   - tests/scripts/     — ingest parser units (AI Act annex extraction)
//   - tests/utils/       — CELEX → ELI URL contract used at ingest time
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
