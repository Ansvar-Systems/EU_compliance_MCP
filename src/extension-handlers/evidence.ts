import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';
import type { CitationEnvelope, CitationManifest } from './citation.js';
import { createCitationResolver } from './instrument-citation.js';

interface EvidenceRow {
  regulation: string;
  article: string;
  requirement_summary: string;
  evidence_type: string;
  artifact_name: string;
  artifact_example: string | null;
  description: string | null;
  retention_period: string | null;
  auditor_questions: string | null;
  maturity_levels: string | null;
  cross_references: string | null;
}

// One evidence requirement, on the standard envelope shape. Field names are
// unchanged from the legacy results rows so row-level consumer access keeps
// working; _citation is additive.
interface EvidenceResult {
  regulation: string;
  article: string;
  requirement_summary: string;
  evidence_type: string;
  artifact_name: string;
  artifact_example: string | null;
  description: string | null;
  retention_period: string | null;
  auditor_questions: unknown[];
  maturity_levels: unknown;
  cross_references: unknown[];
  _citation: CitationEnvelope;
}

const handler: ToolHandler = async (args, ctx) => {
  const regulation = typeof args.regulation === 'string' ? args.regulation : undefined;
  const article = typeof args.article === 'string' ? args.article : undefined;
  const evidence_type = typeof args.evidence_type === 'string' ? args.evidence_type : undefined;
  let limit = typeof args.limit === 'number' ? args.limit : 50;
  if (!Number.isFinite(limit) || limit < 0) limit = 50;
  limit = Math.min(Math.floor(limit), 500);

  let sql = `
    SELECT regulation, article, requirement_summary, evidence_type,
           artifact_name, artifact_example, description, retention_period,
           auditor_questions, maturity_levels, cross_references
    FROM evidence_requirements
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (regulation) {
    sql += ` AND regulation = ?`;
    params.push(regulation);
  }
  if (article) {
    sql += ` AND article = ?`;
    params.push(article);
  }
  if (evidence_type) {
    sql += ` AND evidence_type = ?`;
    params.push(evidence_type);
  }
  sql += ` ORDER BY regulation, CAST(article AS INTEGER), evidence_type LIMIT ?`;
  params.push(limit);

  try {
    const rows = ctx.db.prepare(sql).all(...params) as EvidenceRow[];

    // Per-row _citation: the requirement's article provision when it exists in
    // the corpus (EUR-Lex ELI + #art_N anchor), otherwise the instrument's ELI
    // (:meta row — e.g. UN_R155 sub-paragraph refs like "7.2" are not
    // provision-addressable). A row whose regulation cannot be cited from the
    // corpus at all is skipped-and-counted, never served uncited (no
    // fabrication, conformance I5 — mirrors compare_requirements).
    const resolver = createCitationResolver(ctx.db, (ctx.manifest ?? {}) as CitationManifest);
    const results: EvidenceResult[] = [];
    let omitted = 0;
    for (const row of rows) {
      const resolved = resolver.resolve(row.regulation, row.article);
      if (!resolved) {
        omitted += 1;
        continue;
      }
      results.push({
        regulation: row.regulation,
        article: row.article,
        requirement_summary: row.requirement_summary,
        evidence_type: row.evidence_type,
        artifact_name: row.artifact_name,
        artifact_example: row.artifact_example,
        description: row.description,
        retention_period: row.retention_period,
        auditor_questions: row.auditor_questions ? JSON.parse(row.auditor_questions) : [],
        maturity_levels: row.maturity_levels ? JSON.parse(row.maturity_levels) : null,
        cross_references: row.cross_references ? JSON.parse(row.cross_references) : [],
        _citation: resolved.citation,
      });
    }

    // Honest signal (conformance I1/I2): an empty result set names the filters
    // that produced it. `partial` stays false — a zero-match is a true zero.
    const filters = { regulation, article, evidence_type, limit };
    const messageParts: string[] = [];
    if (results.length === 0 && omitted === 0) {
      const applied = Object.entries({ regulation, article, evidence_type })
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${k}="${v}"`)
        .join(', ');
      messageParts.push(
        applied
          ? `No evidence requirements matched ${applied}. Check the regulation id (e.g. "GDPR", "DORA") and article number.`
          : 'The evidence_requirements table returned no rows.',
      );
    }
    if (omitted > 0) {
      messageParts.push(
        `${omitted} matching requirement(s) omitted (incomplete source attribution).`,
      );
    }

    return textResult({
      results,
      meta: {
        count: results.length,
        filters,
        partial: false,
        message: messageParts.join(' '),
      },
    });
  } catch (e) {
    return errorResult(`get_evidence_requirements: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const getEvidenceRequirementsTool: ExtensionTool = {
  definition: {
    name: 'get_evidence_requirements',
    description:
      'Get audit-evidence requirements for an EU regulation. Returns a {results, meta} envelope: one cited row per requirement with artifact name, example, retention period, auditor questions, maturity-level expectations, and a source_url/publisher/license _citation to the requirement\'s article (or the instrument when the article is not provision-addressable). Filter by regulation, article, or evidence_type.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Regulation ID (e.g. "GDPR", "DORA", "NIS2", "AI_ACT").',
        },
        article: {
          type: 'string',
          description: 'Article number to filter by (e.g. "5", "32").',
        },
        evidence_type: {
          type: 'string',
          enum: ['document', 'log', 'test_result', 'certification', 'policy', 'procedure'],
          description: 'Type of evidence artifact.',
        },
        limit: {
          type: 'number',
          description: 'Max results (default 50, max 500).',
        },
      },
    },
  },
  handler,
};
