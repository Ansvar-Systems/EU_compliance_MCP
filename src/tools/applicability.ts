import type { Database } from 'better-sqlite3';

export type Sector =
  | 'financial'
  | 'healthcare'
  | 'energy'
  | 'transport'
  | 'digital_infrastructure'
  | 'public_administration'
  | 'manufacturing'
  | 'other';

export interface ApplicabilityInput {
  sector: Sector;
  subsector?: string;
  member_state?: string;
  size?: 'sme' | 'large';
}

export interface ApplicableRegulation {
  regulation: string;
  confidence: 'definite' | 'likely' | 'possible';
  basis: string | null;
  notes: string | null;
}

export interface ApplicabilityResult {
  entity: ApplicabilityInput;
  applicable_regulations: ApplicableRegulation[];
}

export async function checkApplicability(
  db: Database,
  input: ApplicabilityInput
): Promise<ApplicabilityResult> {
  const { sector, subsector } = input;

  // Query for matching rules - check both sector match and subsector match
  let sql = `
    SELECT DISTINCT
      regulation,
      confidence,
      basis_article as basis,
      notes
    FROM applicability_rules
    WHERE applies = 1
      AND (
        (sector = ? AND (subsector IS NULL OR subsector = ?))
        OR (sector = ? AND subsector IS NULL)
      )
    ORDER BY
      CASE confidence
        WHEN 'definite' THEN 1
        WHEN 'likely' THEN 2
        WHEN 'possible' THEN 3
      END,
      regulation
  `;

  const rows = db.prepare(sql).all(sector, subsector || '', sector) as Array<{
    regulation: string;
    confidence: 'definite' | 'likely' | 'possible';
    basis: string | null;
    notes: string | null;
  }>;

  // Deduplicate by regulation, keeping highest confidence
  const regulationMap = new Map<string, ApplicableRegulation>();
  for (const row of rows) {
    if (!regulationMap.has(row.regulation)) {
      regulationMap.set(row.regulation, {
        regulation: row.regulation,
        confidence: row.confidence,
        basis: row.basis,
        notes: row.notes,
      });
    }
  }

  return {
    entity: input,
    applicable_regulations: Array.from(regulationMap.values()),
  };
}
