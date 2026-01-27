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
  detail_level?: 'summary' | 'requirements' | 'full';
}

export interface ApplicableRegulation {
  regulation: string;
  confidence: 'definite' | 'likely' | 'possible';
  basis: string | null;
  notes: string | null;
}

export interface RegulationSummary {
  id: string;
  full_name: string;
  confidence: 'definite' | 'likely' | 'possible';
  basis: string | null;
  notes: string | null;
  key_requirements?: string[];
  priority_deadline?: string;
}

export interface ApplicabilityResult {
  entity: ApplicabilityInput;
  applicable_regulations: ApplicableRegulation[];
  summary?: {
    total_count: number;
    by_confidence: {
      definite: number;
      likely: number;
      possible: number;
    };
    regulations_summary: RegulationSummary[];
    next_steps?: string;
  };
}

export async function checkApplicability(
  db: Database,
  input: ApplicabilityInput
): Promise<ApplicabilityResult> {
  const { sector, subsector, detail_level = 'full' } = input;

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

  const applicable_regulations = Array.from(regulationMap.values());

  // If summary detail level requested, add summary section
  let summary;
  if (detail_level === 'summary') {
    // Get regulation metadata for summary
    const regIds = applicable_regulations.map(r => r.regulation);
    const placeholders = regIds.map(() => '?').join(', ');
    const regData = db.prepare(`
      SELECT id, full_name, effective_date
      FROM regulations
      WHERE id IN (${placeholders})
    `).all(...regIds) as Array<{
      id: string;
      full_name: string;
      effective_date: string | null;
    }>;

    const regMetadata = new Map(regData.map(r => [r.id, r]));

    // Priority deadlines for key regulations
    const priorityDeadlines: Record<string, string> = {
      'DORA': 'Jan 17, 2025 (ACTIVE)',
      'NIS2': 'Oct 17, 2024 (Swedish implementation)',
      'AI_ACT': 'Aug 2, 2026 (high-risk systems)',
      'EIDAS2': 'Late 2027 (wallet acceptance)',
      'CSRD': 'Phased 2025-2028',
      'CSDDD': 'Implementation roadmap needed',
    };

    const regulations_summary: RegulationSummary[] = applicable_regulations.map(reg => {
      const metadata = regMetadata.get(reg.regulation);
      return {
        id: reg.regulation,
        full_name: metadata?.full_name || reg.regulation,
        confidence: reg.confidence,
        basis: reg.basis,
        notes: reg.notes,
        priority_deadline: priorityDeadlines[reg.regulation],
      };
    });

    const by_confidence = {
      definite: applicable_regulations.filter(r => r.confidence === 'definite').length,
      likely: applicable_regulations.filter(r => r.confidence === 'likely').length,
      possible: applicable_regulations.filter(r => r.confidence === 'possible').length,
    };

    summary = {
      total_count: applicable_regulations.length,
      by_confidence,
      regulations_summary,
      next_steps: "For detailed requirements, use detail_level='requirements'. For full article-level detail, use detail_level='full'.",
    };
  }

  return {
    entity: input,
    applicable_regulations,
    summary,
  };
}
