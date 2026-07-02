import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';
import type { CitationEnvelope, CitationManifest } from './citation.js';
import { createCitationResolver } from './instrument-citation.js';

interface MapRow {
  control_id: string;
  control_name: string;
  regulation: string;
  articles: string;
  coverage: 'full' | 'partial' | 'related';
  notes: string | null;
}

// One control→regulation mapping, on the standard envelope shape: a result row
// is one (control, regulation) pair so it can carry ONE _citation. The legacy
// shape grouped mappings under a per-control `controls` array; agents group by
// `control_id` instead. Mapping-level field names (regulation / articles /
// coverage / notes) are unchanged.
interface MappingResult {
  control_id: string;
  control_name: string;
  regulation: string;
  articles: string[];
  coverage: 'full' | 'partial' | 'related';
  notes: string | null;
  _citation: CitationEnvelope;
}

const VALID_FRAMEWORKS = ['ISO27001', 'NIST_CSF'] as const;

const handler: ToolHandler = async (args, ctx) => {
  const framework = typeof args.framework === 'string' ? args.framework : undefined;
  const control = typeof args.control === 'string' ? args.control : undefined;
  const regulation = typeof args.regulation === 'string' ? args.regulation : undefined;
  let limit = typeof args.limit === 'number' ? args.limit : 100;
  if (!Number.isFinite(limit) || limit < 0) limit = 100;
  limit = Math.min(Math.floor(limit), 1000);

  if (!framework || !VALID_FRAMEWORKS.includes(framework as (typeof VALID_FRAMEWORKS)[number])) {
    return errorResult(
      `map_controls: framework is required and must be one of: ${VALID_FRAMEWORKS.join(', ')}`,
    );
  }

  let sql = `
    SELECT control_id, control_name, regulation, articles, coverage, notes
    FROM control_mappings
    WHERE framework = ?
  `;
  const params: unknown[] = [framework];
  if (control) {
    sql += ` AND control_id = ?`;
    params.push(control);
  }
  if (regulation) {
    sql += ` AND regulation = ?`;
    params.push(regulation);
  }
  sql += ` ORDER BY control_id, regulation LIMIT ?`;
  params.push(limit);

  try {
    const rows = ctx.db.prepare(sql).all(...params) as MapRow[];

    // Per-row _citation: a mapping to exactly one article cites that article's
    // provision (EUR-Lex ELI + #art_N anchor); a mapping spanning several
    // articles cites the instrument's ELI (:meta row) — anchoring one article
    // of many would mis-cite the mapping. A mapping whose regulation cannot be
    // cited from the corpus at all is skipped-and-counted, never served
    // uncited (no fabrication, conformance I5 — mirrors compare_requirements).
    const resolver = createCitationResolver(ctx.db, (ctx.manifest ?? {}) as CitationManifest);
    const results: MappingResult[] = [];
    let omitted = 0;
    for (const row of rows) {
      const articles: string[] = row.articles ? JSON.parse(row.articles) : [];
      const resolved = resolver.resolve(
        row.regulation,
        articles.length === 1 ? articles[0] : null,
      );
      if (!resolved) {
        omitted += 1;
        continue;
      }
      results.push({
        control_id: row.control_id,
        control_name: row.control_name,
        regulation: row.regulation,
        articles,
        coverage: row.coverage,
        notes: row.notes,
        _citation: resolved.citation,
      });
    }

    // Honest signal (conformance I1/I2): an empty result set names the filters
    // that produced it. `partial` stays false — a zero-match is a true zero.
    const messageParts: string[] = [];
    if (results.length === 0 && omitted === 0) {
      const applied = Object.entries({ framework, control, regulation })
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      messageParts.push(
        `No control mappings matched ${applied}. Check the control id (e.g. "A.5.1", "PR.AC-1") and regulation id.`,
      );
    }
    if (omitted > 0) {
      messageParts.push(`${omitted} mapping(s) omitted (incomplete source attribution).`);
    }

    return textResult({
      results,
      meta: {
        framework,
        count: results.length,
        controls_matched: new Set(results.map((r) => r.control_id)).size,
        filters: { control, regulation, limit },
        partial: false,
        message: messageParts.join(' '),
      },
    });
  } catch (e) {
    return errorResult(`map_controls: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const mapControlsTool: ExtensionTool = {
  definition: {
    name: 'map_controls',
    description:
      'Map ISO 27001 or NIST CSF controls to EU regulation articles. Returns a {results, meta} envelope: one cited row per control→regulation mapping with full/partial/related coverage, the applicable articles, notes, and a source_url/publisher/license _citation (article-anchored when the mapping targets a single article, instrument-level otherwise). Group rows by control_id for a per-control view; filter by control or regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        framework: {
          type: 'string',
          enum: ['ISO27001', 'NIST_CSF'],
          description: 'Control framework to map from.',
        },
        control: {
          type: 'string',
          description: 'Specific control ID to filter (e.g. "A.5.1", "PR.AC-1").',
        },
        regulation: {
          type: 'string',
          description: 'Regulation ID to filter mappings (e.g. "DORA", "NIS2").',
        },
        limit: {
          type: 'number',
          description: 'Max result rows (default 100, max 1000).',
        },
      },
      required: ['framework'],
    },
  },
  handler,
};
