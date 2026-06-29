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
    // Realistic attribution/licensing slice — compare_requirements reads
    // manifest.attribution.publisher to build per-row _citation. Mirrors the
    // values in manifest.json (build-db stamps content.license_code from the
    // same licensing.license_code).
    manifest: {
      attribution: { publisher: 'Publications Office of the European Union' },
      licensing: { license_code: 'EUR-Lex-Decision-2011-833' },
    },
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

interface Timeline {
  text: string;
  kind: 'hours' | 'days' | 'qualitative';
  value?: number;
}
interface Citation {
  source_url: string;
  publisher: string;
  license: string;
  canonical_ref: string;
  display_text: string;
  lookup: { tool: string; args: Record<string, unknown> };
  article?: string;
  effective_date?: string;
  source_full_name?: string;
}
interface ComparisonRow {
  regulation: string;
  canonical_ref: string;
  article: string;
  title: string | null;
  snippet: string;
  timelines: Timeline[];
  _citation: Citation;
}
interface CompareEnvelope {
  results: ComparisonRow[];
  meta: {
    topic: string;
    regulations_compared: string[];
    expanded_terms: string[];
    coverage: Array<{ regulation: string; matched: number }>;
    regulations_without_matches: string[];
    partial: boolean;
    message: string;
  };
}

// The single-publisher / single-license values manifest.json declares for the
// eu-regulations corpus (build-db stamps the license onto content.license_code).
const EU_PUBLISHER = 'Publications Office of the European Union';
const EU_LICENSE = 'EUR-Lex-Decision-2011-833';

function parseCompare(result: CallToolResult): CompareEnvelope {
  return parsePayload(result) as unknown as CompareEnvelope;
}

// The conformance invariants compare_requirements must satisfy (mirrors the
// gateway's src/conformance.py I0/I1/I2/I5 over the {results, meta} envelope).
function assertConformant(env: CompareEnvelope): void {
  // I0 — standard envelope.
  expect(Array.isArray(env.results), 'I0: results is an array').toBe(true);
  expect(typeof env.meta, 'I0: meta is an object').toBe('object');
  // I1 — empty results carry an explanatory signal (never a silent zero).
  if (env.results.length === 0) {
    expect(env.meta.message.length > 0 || env.meta.partial, 'I1: empty set is signposted').toBe(true);
  }
  // I2 — partial ⇔ message; no hidden contradiction. compare never reports
  // partial: a regulation with no matching provisions is a true zero-match, not
  // a downstream-availability degradation (the gap is named in the message).
  expect(env.meta.partial, 'compare never reports partial').toBe(false);
  if (env.meta.partial) expect(env.meta.message.length, 'I2: partial implies a message').toBeGreaterThan(0);
  // I5 — every served row carries the full citation triple.
  for (const row of env.results) {
    expect(row._citation, `I5: row ${row.canonical_ref} has _citation`).toBeDefined();
    expect(row._citation.source_url.length, `I5: ${row.canonical_ref} source_url`).toBeGreaterThan(0);
    expect(row._citation.publisher.length, `I5: ${row.canonical_ref} publisher`).toBeGreaterThan(0);
    expect(row._citation.license.length, `I5: ${row.canonical_ref} license`).toBeGreaterThan(0);
  }
}

describe('compare_requirements', () => {
  it('returns a conformant {results, meta} envelope across DORA and NIS2', async () => {
    const result = await call('compare_requirements', {
      topic: 'incident reporting',
      regulations: ['DORA', 'NIS2'],
    });
    expect(result.isError).toBeUndefined();
    const env = parseCompare(result);
    assertConformant(env);

    expect(env.meta.topic).toBe('incident reporting');
    expect(env.meta.regulations_compared).toEqual(['DORA', 'NIS2']);
    // synonym expansion still reaches the sibling concept family
    expect(env.meta.expanded_terms).toContain('breach notification');

    // both regulations are represented as grouped rows
    const byReg = new Set(env.results.map((r) => r.regulation));
    expect(byReg.has('DORA')).toBe(true);
    expect(byReg.has('NIS2')).toBe(true);

    // meta.coverage matches the rows actually returned
    const countsFromRows = new Map<string, number>();
    for (const r of env.results) countsFromRows.set(r.regulation, (countsFromRows.get(r.regulation) ?? 0) + 1);
    for (const cov of env.meta.coverage) {
      expect(cov.matched).toBe(countsFromRows.get(cov.regulation) ?? 0);
    }

    // every row is a fully-formed, addressable, cited provision
    for (const row of env.results) {
      expect(row.canonical_ref.startsWith(`${row.regulation}:`)).toBe(true);
      expect(row.article).toMatch(/^art_/);
      expect(Array.isArray(row.timelines)).toBe(true);
      const cite = row._citation;
      expect(cite.publisher).toBe(EU_PUBLISHER);
      expect(cite.license).toBe(EU_LICENSE);
      expect(cite.canonical_ref).toBe(row.canonical_ref);
      expect(cite.source_url).toMatch(/^https:\/\/eur-lex\.europa\.eu\/eli\//);
      // _citation omits `article` to match the reference-grade search/get_provision
      // citation for eu-regulations (no article column); the article lives on the
      // row's top-level `article` field and inside canonical_ref/source_url.
      expect(cite.article).toBeUndefined();
      // round-trip pointer back to the provision-addressable tool
      expect(cite.lookup.tool).toBe('get_provision');
      expect(cite.lookup.args.canonical_ref).toBe(row.canonical_ref);
    }
  });

  it('reaches GDPR breach-notification articles for incident reporting (regression: synonym set is not truncated past the GDPR-native term)', async () => {
    const result = await call('compare_requirements', {
      topic: 'incident reporting',
      regulations: ['DORA', 'NIS2', 'GDPR'],
    });
    expect(result.isError).toBeUndefined();
    const env = parseCompare(result);
    assertConformant(env);
    // GDPR's controlled vocabulary is "personal data breach" (not "incident");
    // it lives in the sibling concept family and MUST survive expansion.
    expect(env.meta.expanded_terms).toContain('personal data breach');

    const gdprArticles = env.results.filter((r) => r.regulation === 'GDPR').map((r) => r.article);
    // art_33 (breach notification to the supervisory authority) / art_34 are the
    // canonical answers — empty here was the original Signal-2 defect.
    expect(gdprArticles.length).toBeGreaterThan(0);
    expect(
      gdprArticles.some((a) => a === 'art_33' || a === 'art_34'),
      `GDPR articles ${JSON.stringify(gdprArticles)} include art_33/art_34`,
    ).toBe(true);
  });

  it('binds structured timelines to the article they came from', async () => {
    const result = await call('compare_requirements', {
      topic: 'incident reporting',
      regulations: ['NIS2', 'GDPR'],
    });
    const env = parseCompare(result);
    assertConformant(env);

    // every timeline (wherever it appears) is well-formed and article-bound
    for (const row of env.results) {
      for (const t of row.timelines) {
        expect(typeof t.text).toBe('string');
        expect(t.text.length).toBeGreaterThan(0);
        expect(['hours', 'days', 'qualitative']).toContain(t.kind);
        if (t.kind === 'qualitative') expect(t.value).toBeUndefined();
        else expect(typeof t.value).toBe('number');
      }
    }

    // GDPR art_33 carries the canonical "72 hours" obligation as a structured,
    // de-duplicated entry (the corpus mixes a normal space and a non-breaking
    // space; both must collapse to a single "72 hours" timeline).
    const art33 = env.results.find((r) => r.canonical_ref === 'GDPR:art_33');
    expect(art33, 'GDPR:art_33 present').toBeDefined();
    const hours72 = art33!.timelines.filter((t) => t.kind === 'hours' && t.value === 72);
    expect(hours72.length, `exactly one 72-hour timeline: ${JSON.stringify(art33!.timelines)}`).toBe(1);
    // art_33 also carries the qualitative "without undue delay" obligation —
    // locks the qualitative extraction regexes alongside the numeric ones.
    expect(
      art33!.timelines.some((t) => t.kind === 'qualitative' && /without\s+undue\s+delay/i.test(t.text)),
      `GDPR:art_33 carries a qualitative timeline: ${JSON.stringify(art33!.timelines)}`,
    ).toBe(true);
  });

  it('signposts a regulation with no matches instead of silently dropping it', async () => {
    const result = await call('compare_requirements', {
      topic: 'incident reporting',
      regulations: ['DORA', 'NO_SUCH_REG_XYZ'],
    });
    const env = parseCompare(result);
    assertConformant(env);
    expect(env.results.some((r) => r.regulation === 'DORA')).toBe(true);
    expect(env.meta.regulations_without_matches).toContain('NO_SUCH_REG_XYZ');
    expect(env.meta.message).toContain('NO_SUCH_REG_XYZ');
    expect(env.meta.partial).toBe(false);
  });

  it('returns an honest empty envelope (not a silent zero) when nothing matches', async () => {
    const result = await call('compare_requirements', {
      topic: 'asdfqwerzxcvnonsense',
      regulations: ['DORA'],
    });
    const env = parseCompare(result);
    assertConformant(env);
    expect(env.results.length).toBe(0);
    expect(env.meta.message.length).toBeGreaterThan(0); // I1: not a silent zero
  });

  it('skips rows it cannot fully cite (no manifest publisher) instead of fabricating attribution', async () => {
    // publisher is only resolvable from the manifest; with no attribution block
    // every row's citation triple is incomplete → every row must be dropped
    // (no fabrication, conformance I5) and the omission surfaced honestly.
    const tool = handlers.get('compare_requirements')!;
    const noPublisherCtx: ToolHandlerContext = { db: ctx.db, manifest: {}, coverageSummary: 'test' };
    const result = await tool.handler(
      { topic: 'incident reporting', regulations: ['DORA', 'GDPR'] },
      noPublisherCtx,
    );
    expect(result.isError).toBeUndefined();
    const env = parseCompare(result);
    assertConformant(env); // still on-contract: empty + honest message
    expect(env.results.length).toBe(0);
    expect(env.meta.message).toMatch(/incomplete source attribution/i);
    expect(env.meta.coverage.every((c) => c.matched === 0)).toBe(true);
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
