// Extension-handler tests promised by the Phase 5.A migration (the old
// vitest.config.ts comment: "a new tests/extensions/ tree will exercise those
// handlers against the chassis-shape DB"). These run the 5 EU-local tools
// against the REAL data/regulations.db committed to the repo — the same file
// the Dockerfile bakes into the image — so a schema drift between build-db.ts
// and the handlers fails here before it fails in prod.
//
// better-sqlite3 (devDependency) structurally satisfies the SqliteDatabase
// subset in src/extension-handlers/types.ts (prepare → all/get/run). The
// chassis runtime uses @ansvar/mcp-sqlite; the handlers only touch the shared
// prepare() surface.
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

let handlers: Map<string, ExtensionTool>;
let ctx: ToolHandlerContext;

function parsePayload(result: CallToolResult): Record<string, unknown> {
  expect(result.content).toHaveLength(1);
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const tool = handlers.get(name);
  expect(tool, `tool ${name} is registered`).toBeDefined();
  return tool!.handler(args, ctx);
}

beforeAll(async () => {
  // GUIDES_DIR is read at module-import time — set the env override before
  // the dynamic import so get_regulation_guide resolves the repo's guides.
  process.env.EU_COMPLIANCE_GUIDES_DIR = GUIDES_DIR;
  const mod = await import('../../src/extension-handlers/index.js');
  handlers = mod.euExtensionHandlers;

  const db = new Database(DB_PATH, { readonly: true });
  ctx = {
    db,
    manifest: {},
    coverageSummary: 'test',
  };
});

describe('extension handler registry', () => {
  it('registers exactly the 5 EU-local tools', () => {
    expect(Array.from(handlers.keys()).sort()).toEqual([
      'check_applicability',
      'compare_requirements',
      'get_evidence_requirements',
      'get_regulation_guide',
      'map_controls',
    ]);
  });

  it('every tool declares a name matching its registry key and an object schema', () => {
    for (const [key, tool] of handlers) {
      expect(tool.definition.name).toBe(key);
      expect(tool.definition.inputSchema.type).toBe('object');
      expect(tool.definition.description.length).toBeGreaterThan(20);
    }
  });
});

describe('compare_requirements', () => {
  it('compares incident reporting across DORA and NIS2 with synonym expansion', async () => {
    const result = await call('compare_requirements', {
      topic: 'incident reporting',
      regulations: ['DORA', 'NIS2'],
    });
    expect(result.isError).toBeUndefined();
    const payload = parsePayload(result);
    expect(payload.topic).toBe('incident reporting');
    expect(payload.expanded_terms as string[]).toContain('breach notification');
    const regs = payload.regulations as Array<{
      regulation: string;
      articles: string[];
      requirements: string[];
    }>;
    expect(regs.map((r) => r.regulation)).toEqual(['DORA', 'NIS2']);
    for (const reg of regs) {
      expect(reg.articles.length).toBeGreaterThan(0);
      // canonical_ref "REG:art_N" → handler exposes the "art_N" part
      expect(reg.articles[0]).toMatch(/^art_/);
      expect(reg.requirements.length).toBe(reg.articles.length);
    }
  });

  it('rejects a missing topic and a missing regulations array', async () => {
    const noTopic = await call('compare_requirements', { regulations: ['DORA'] });
    expect(noTopic.isError).toBe(true);
    const noRegs = await call('compare_requirements', { topic: 'encryption' });
    expect(noRegs.isError).toBe(true);
  });
});

describe('map_controls', () => {
  it('maps ISO27001 controls to regulations, grouped by control', async () => {
    const result = await call('map_controls', { framework: 'ISO27001' });
    expect(result.isError).toBeUndefined();
    const payload = parsePayload(result);
    expect(payload.framework).toBe('ISO27001');
    expect(payload.count as number).toBeGreaterThan(0);
    const controls = payload.controls as Array<{
      control_id: string;
      mappings: Array<{ regulation: string; articles: string[]; coverage: string }>;
    }>;
    const first = controls[0];
    expect(first.mappings.length).toBeGreaterThan(0);
    expect(['full', 'partial', 'related']).toContain(first.mappings[0].coverage);
    expect(Array.isArray(first.mappings[0].articles)).toBe(true);
  });

  it('filters by regulation and rejects unknown frameworks', async () => {
    const filtered = await call('map_controls', {
      framework: 'NIST_CSF',
      regulation: 'DORA',
    });
    expect(filtered.isError).toBeUndefined();
    const payload = parsePayload(filtered);
    const controls = payload.controls as Array<{
      mappings: Array<{ regulation: string }>;
    }>;
    for (const c of controls) {
      for (const m of c.mappings) expect(m.regulation).toBe('DORA');
    }

    const bad = await call('map_controls', { framework: 'COBIT' });
    expect(bad.isError).toBe(true);
  });
});

describe('get_evidence_requirements', () => {
  it('returns audit-evidence artifacts for AI_ACT with parsed JSON fields', async () => {
    const result = await call('get_evidence_requirements', { regulation: 'AI_ACT' });
    expect(result.isError).toBeUndefined();
    const payload = parsePayload(result);
    expect(payload.count as number).toBeGreaterThan(0);
    const rows = payload.results as Array<{
      regulation: string;
      artifact_name: string;
      auditor_questions: unknown[];
      cross_references: unknown[];
    }>;
    for (const row of rows) {
      expect(row.regulation).toBe('AI_ACT');
      expect(row.artifact_name.length).toBeGreaterThan(0);
      expect(Array.isArray(row.auditor_questions)).toBe(true);
      expect(Array.isArray(row.cross_references)).toBe(true);
    }
  });

  it('returns an empty result set (not an error) for an unknown regulation', async () => {
    const result = await call('get_evidence_requirements', {
      regulation: 'NOT_A_REGULATION',
    });
    expect(result.isError).toBeUndefined();
    const payload = parsePayload(result);
    expect(payload.count).toBe(0);
  });
});

describe('check_applicability', () => {
  it('returns regulations applicable to the financial sector', async () => {
    const result = await call('check_applicability', { sector: 'financial' });
    expect(result.isError).toBeUndefined();
    const payload = parsePayload(result);
    const text = JSON.stringify(payload);
    // DORA is the canonical financial-sector regulation; the applicability
    // table has 63 financial rows — DORA must be among them.
    expect(text).toContain('DORA');
  });

  it('rejects an invalid sector with the valid-sector list', async () => {
    const result = await call('check_applicability', { sector: 'space-mining' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('financial');
  });
});

describe('get_regulation_guide', () => {
  it('renders the DORA guide as markdown (quick level)', async () => {
    const result = await call('get_regulation_guide', { regulation: 'DORA' });
    expect(result.isError).toBeUndefined();
    const text = result.content[0].text;
    expect(text).toContain('DORA');
    expect(text).toMatch(/###/); // markdown sections
  });

  it('full detail level is a superset of quick', async () => {
    const quick = await call('get_regulation_guide', {
      regulation: 'AI_ACT',
      detail_level: 'quick',
    });
    const full = await call('get_regulation_guide', {
      regulation: 'AI_ACT',
      detail_level: 'full',
    });
    expect(quick.isError).toBeUndefined();
    expect(full.isError).toBeUndefined();
    expect(full.content[0].text.length).toBeGreaterThanOrEqual(
      quick.content[0].text.length,
    );
  });

  it('reports unknown regulations gracefully without throwing', async () => {
    const result = await call('get_regulation_guide', { regulation: 'NOPE' });
    const text = result.content[0].text;
    expect(text.toLowerCase()).toContain('nope');
  });
});
