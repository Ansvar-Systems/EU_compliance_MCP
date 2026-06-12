#!/usr/bin/env npx tsx

/**
 * One-off backfill: stamp `metadata.license` on legacy guidance seeds that
 * predate the per-document license convention (issue #79).
 *
 * Scope: the 113 legacy guidance documents — 105 MDCG (related_regulation:
 * 'both') + 8 AI_ACT — shipped before the wave-1 (CRA/NIS2/DORA) corpus
 * introduced `metadata.license`. Both source families are published on
 * European Commission hosts (health.ec.europa.eu for MDCG,
 * digital-strategy.ec.europa.eu for AI_ACT / AI Office), so reuse is governed
 * by Commission Decision 2011/833/EU — the same basis and exact license code
 * (`EU-Decision-2011-833`) the wave-1 Commission seeds already carry. The
 * Commission legal notice (https://commission.europa.eu/legal-notice_en)
 * confirms: "The Commission's reuse policy is implemented by the Commission
 * Decision of 12 December 2011 on the reuse of Commission documents."
 *
 * Committed for auditability — this is a deterministic, idempotent rewrite of
 * the seed JSON only (no DB writes). Run via: npx tsx scripts/backfill-guidance-licenses.ts
 *
 * Formatting: rewrites with JSON.stringify(…, 2) + trailing newline to match
 * the existing seed formatting (2-space indent, terminal '\n'). `license` is
 * placed first in `metadata` to mirror the wave-1 convention, with any
 * pre-existing metadata keys preserved (and their order kept) after it.
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LICENSE_CODE = 'EU-Decision-2011-833';
const EXPECTED = 113;
const GUIDANCE_DIR = join(import.meta.dirname, '..', 'data', 'seed', 'guidance');

function main(): void {
  const files = readdirSync(GUIDANCE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  let touched = 0;
  for (const file of files) {
    const path = join(GUIDANCE_DIR, file);
    const doc = JSON.parse(readFileSync(path, 'utf8'));

    const existing = doc.metadata;
    if (existing && typeof existing === 'object' && existing.license) {
      // Already has a license — leave untouched (idempotent).
      continue;
    }

    // Build metadata with `license` first, preserving any pre-existing keys.
    const rest = existing && typeof existing === 'object' ? existing : {};
    doc.metadata = { license: LICENSE_CODE, ...rest };

    writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
    console.log(`backfilled license -> ${file}`);
    touched += 1;
  }

  console.log(`\nBackfilled ${touched} guidance seed(s) with license=${LICENSE_CODE}`);

  if (touched !== EXPECTED) {
    throw new Error(
      `expected to backfill exactly ${EXPECTED} seeds, but touched ${touched}; ` +
        `aborting — investigate the guidance seed set before committing.`,
    );
  }
}

main();
