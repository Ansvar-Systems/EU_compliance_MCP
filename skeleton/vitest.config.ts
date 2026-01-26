/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VITEST CONFIGURATION
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Configuration for the Vitest test runner.
 *
 * Vitest is chosen because:
 *   - Fast (uses Vite's transform pipeline)
 *   - Native ESM support
 *   - Jest-compatible API (easy migration)
 *   - Built-in coverage reporting
 *   - TypeScript support out of the box
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ─────────────────────────────────────────────────────────────────────────
    // GLOBALS
    // ─────────────────────────────────────────────────────────────────────────
    // Enable global test functions (describe, it, expect)
    // This allows using them without importing
    globals: true,

    // ─────────────────────────────────────────────────────────────────────────
    // ENVIRONMENT
    // ─────────────────────────────────────────────────────────────────────────
    // Use Node.js environment (not browser/jsdom)
    environment: 'node',

    // ─────────────────────────────────────────────────────────────────────────
    // TEST FILES
    // ─────────────────────────────────────────────────────────────────────────
    // Look for test files in tests/ directory
    include: ['tests/**/*.test.ts'],

    // Exclude these patterns
    exclude: [
      'node_modules',
      'dist',
      '.git',
    ],

    // ─────────────────────────────────────────────────────────────────────────
    // COVERAGE
    // ─────────────────────────────────────────────────────────────────────────
    coverage: {
      // Use V8 coverage provider (built into Node.js)
      provider: 'v8',

      // Output formats
      reporter: ['text', 'html', 'json'],

      // Only cover src/ files
      include: ['src/**/*.ts'],

      // Exclude these from coverage
      exclude: [
        'src/index.ts',  // Entry point (tested via integration)
      ],

      // Require 80% coverage (adjust as needed)
      // Uncomment to enforce:
      // thresholds: {
      //   lines: 80,
      //   functions: 80,
      //   branches: 80,
      //   statements: 80,
      // },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // REPORTER
    // ─────────────────────────────────────────────────────────────────────────
    // Use verbose reporter for detailed output
    reporters: ['verbose'],

    // ─────────────────────────────────────────────────────────────────────────
    // TIMEOUTS
    // ─────────────────────────────────────────────────────────────────────────
    // Test timeout (5 seconds should be plenty for unit tests)
    testTimeout: 5000,

    // Hook timeout
    hookTimeout: 5000,

    // ─────────────────────────────────────────────────────────────────────────
    // PARALLELIZATION
    // ─────────────────────────────────────────────────────────────────────────
    // Run test files in parallel
    // Each file runs its own tests sequentially
    fileParallelism: true,

    // ─────────────────────────────────────────────────────────────────────────
    // WATCH MODE
    // ─────────────────────────────────────────────────────────────────────────
    // Files to watch for changes
    watchExclude: ['node_modules', 'dist'],
  },
});
