import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';

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
    const results = rows.map((row) => ({
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
    }));
    return textResult({ count: results.length, results });
  } catch (e) {
    return errorResult(`get_evidence_requirements: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const getEvidenceRequirementsTool: ExtensionTool = {
  definition: {
    name: 'get_evidence_requirements',
    description:
      'Get audit-evidence requirements for an EU regulation. Returns artifact names, examples, retention periods, auditor questions, and maturity-level expectations. Filter by regulation, article, or evidence_type.',
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
