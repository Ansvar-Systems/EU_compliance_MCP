import type { DatabaseAdapter } from '../database/types.js';

export interface EvidenceInput {
  regulation?: string;
  article?: string;
  evidence_type?: 'document' | 'log' | 'test_result' | 'certification' | 'policy' | 'procedure';
}

export interface EvidenceRequirement {
  regulation: string;
  article: string;
  requirement_summary: string;
  evidence_type: string;
  artifact_name: string;
  artifact_example: string | null;
  description: string | null;
  retention_period: string | null;
  auditor_questions: string[];
  maturity_levels: {
    basic?: string;
    intermediate?: string;
    advanced?: string;
  } | null;
  cross_references: string[];
}

export async function getEvidenceRequirements(
  db: DatabaseAdapter,
  input: EvidenceInput
): Promise<EvidenceRequirement[]> {
  const { regulation, article, evidence_type } = input;

  let sql = `
    SELECT
      regulation,
      article,
      requirement_summary,
      evidence_type,
      artifact_name,
      artifact_example,
      description,
      retention_period,
      auditor_questions,
      maturity_levels,
      cross_references
    FROM evidence_requirements
    WHERE 1=1
  `;

  const params: string[] = [];

  if (regulation) {
    sql += ` AND regulation = $${params.length + 1}`;
    params.push(regulation);
  }

  if (article) {
    sql += ` AND article = $${params.length + 1}`;
    params.push(article);
  }

  if (evidence_type) {
    sql += ` AND evidence_type = $${params.length + 1}`;
    params.push(evidence_type);
  }

  sql += ` ORDER BY regulation, article::INTEGER, evidence_type`;

  const result = await db.query(sql, params);

  return result.rows.map((row: any) => ({
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
}
