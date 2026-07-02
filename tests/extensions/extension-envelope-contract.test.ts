// Contract test: EVERY EU extension tool serves the standard {results, meta}
// envelope with a complete per-row `_citation` (source_url + publisher +
// license — the airtight attribution triple), and every citation's
// `lookup.args.canonical_ref` round-trips to a real provision row in the
// SHIPPED data/regulations.db (the same file the Dockerfile bakes). This is
// the durable guard for the off-envelope drift the 2026-07-01 gateway
// conformance audit flagged (get_regulation_guide raw markdown; map_controls /
// get_evidence_requirements / check_applicability bespoke shapes) — the same
// class compare_requirements was fixed for in Batch B (#102).
//
// Style mirrors guide-delegated-acts-resolve.test.ts: source of truth is the
// shipped DB, so a tool can never emit a citation the deployed corpus cannot
// actually resolve.

import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import type {
  ExtensionTool,
  ToolHandlerContext,
  CallToolResult,
} from '../../src/extension-handlers/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DB_PATH = join(REPO_ROOT, 'data', 'regulations.db');
const GUIDES_DIR = join(REPO_ROOT, 'data', 'guides');

// The single-publisher / single-license values manifest.json declares for the
// eu-regulations corpus.
const EU_PUBLISHER = 'Publications Office of the European Union';
const EU_LICENSE = 'EUR-Lex-Decision-2011-833';

// One representative on-data call per tool.
const CANONICAL_CALLS: Array<{ tool: string; args: Record<string, unknown> }> = [
  { tool: 'compare_requirements', args: { topic: 'incident reporting', regulations: ['DORA', 'NIS2'] } },
  { tool: 'check_applicability', args: { sector: 'financial' } },
  { tool: 'get_evidence_requirements', args: { regulation: 'GDPR' } },
  { tool: 'map_controls', args: { framework: 'ISO27001' } },
  { tool: 'get_regulation_guide', args: { regulation: 'DORA', detail_level: 'full' } },
];

interface CitedRow {
  _citation: {
    source_url: string;
    publisher: string;
    license: string;
    canonical_ref: string;
    display_text: string;
    lookup: { tool: string; args: Record<string, unknown> };
  };
  [key: string]: unknown;
}
interface Envelope {
  results: CitedRow[];
  meta: { partial: boolean; message: string; [key: string]: unknown };
}

let handlers: Map<string, ExtensionTool>;
let ctx: ToolHandlerContext;
let provisionExists: (canonicalRef: string) => boolean;

beforeAll(async () => {
  process.env.EU_COMPLIANCE_GUIDES_DIR = GUIDES_DIR;
  const mod = await import('../../src/extension-handlers/index.js');
  handlers = mod.euExtensionHandlers;

  const db = new Database(DB_PATH, { readonly: true });
  ctx = {
    db,
    manifest: {
      attribution: { publisher: EU_PUBLISHER },
      licensing: { license_code: EU_LICENSE },
    },
    coverageSummary: 'test',
  };
  const stmt = db.prepare('SELECT 1 FROM provisions WHERE canonical_ref = ?');
  provisionExists = (ref) => stmt.get(ref) !== undefined;
});

async function callEnvelope(tool: string, args: Record<string, unknown>): Promise<Envelope> {
  const result: CallToolResult = await handlers.get(tool)!.handler(args, ctx);
  expect(result.isError, `${tool} succeeds`).toBeUndefined();
  expect(result.content).toHaveLength(1);
  return JSON.parse(result.content[0].text) as Envelope;
}

describe('extension-tool envelope + citation contract', () => {
  for (const { tool, args } of CANONICAL_CALLS) {
    describe(tool, () => {
      it('serves the {results, meta} envelope with honest signals (I0/I1/I2)', async () => {
        const env = await callEnvelope(tool, args);
        // I0 — the standard envelope, nothing else at the top level (the
        // gateway audit-ledger redaction allow-list scrubs unknown keys).
        expect(Object.keys(env).sort()).toEqual(['meta', 'results']);
        expect(Array.isArray(env.results)).toBe(true);
        expect(typeof env.meta).toBe('object');
        // I1 — an empty set must carry a message; I2 — never a bare partial.
        if (env.results.length === 0) {
          expect(env.meta.message.length).toBeGreaterThan(0);
        }
        expect(env.meta.partial).toBe(false);
        expect(typeof env.meta.message).toBe('string');
      });

      it('cites every row with the complete triple, resolvable in the shipped DB (I5)', async () => {
        const env = await callEnvelope(tool, args);
        expect(env.results.length, `${tool} canonical call returns rows`).toBeGreaterThan(0);
        for (const row of env.results) {
          const c = row._citation;
          expect(c, 'row carries _citation').toBeDefined();
          expect(c.source_url).toMatch(/^https:\/\/eur-lex\.europa\.eu\//);
          expect(c.publisher).toBe(EU_PUBLISHER);
          expect(c.license).toBe(EU_LICENSE);
          expect(c.display_text.length).toBeGreaterThan(0);
          // round-trip: the lookup pointer resolves in the corpus this repo ships
          expect(c.lookup.tool).toBe('get_provision');
          const ref = c.lookup.args.canonical_ref as string;
          expect(ref).toBe(c.canonical_ref);
          expect(provisionExists(ref), `${ref} exists in provisions`).toBe(true);
        }
      });
    });
  }
});
