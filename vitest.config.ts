import { defineConfig } from 'vitest/config';

// Phase 5.A chassis migration (2026-05-26): the legacy in-process MCP handlers
// in src/tools/, src/database/, src/worker.ts are retired. The customer-facing
// MCP surface is now served by @ansvar/mcp-base v0.1.28+ chassis (see
// Dockerfile + manifest.json). The existing tests/ tree exercises the legacy
// handlers against the legacy regulations.db schema (articles, articles_fts,
// regulations tables) — that schema no longer exists in the chassis-shape DB,
// so those tests fail with "no such table: articles".
//
// Phase 5.B reintroduces the 5 EU-local tools (compare_requirements,
// map_controls, get_evidence_requirements, regulation_guide,
// check_applicability) via mcp-base v0.1.26's extensionHandlers API. At that
// point a new tests/extensions/ tree will exercise those handlers against the
// chassis-shape DB.
//
// Until then, the legacy tests/ tree is excluded from CI runs. The chassis
// itself is tested in mcp-base's 673-test suite + end-to-end via local docker
// build + run (validated in PR description).
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: [
      '**/node_modules/**',
      'tests/database.test.ts',
      'tests/health.test.ts',
      'tests/tools/**',
      'tests/middleware/**',
      'tests/integration/**',
      'tests/content/**',
      'tests/golden/**',
      'tests/comprehensive/**',
      'tests/fixtures/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
    },
  },
});
