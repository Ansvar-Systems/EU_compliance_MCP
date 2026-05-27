import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';

const VALID_SECTORS = [
  'financial',
  'healthcare',
  'energy',
  'transport',
  'digital_infrastructure',
  'public_administration',
  'manufacturing',
  'other',
] as const;

// Stable map kept as-is from legacy applicability.ts. Used to enrich summary
// detail level. Update as enforcement dates land.
const PRIORITY_DEADLINES: Record<string, string> = {
  DORA: 'Jan 17, 2025 (ACTIVE)',
  NIS2: 'Oct 17, 2024 (Swedish implementation)',
  AI_ACT: 'Aug 2, 2026 (high-risk systems)',
  EIDAS2: 'Late 2027 (wallet acceptance)',
  CSRD: 'Phased 2025-2028',
  CSDDD: 'Implementation roadmap needed',
};

interface ApplicabilityRow {
  regulation: string;
  confidence: 'definite' | 'likely' | 'possible';
  basis: string | null;
  notes: string | null;
}

const handler: ToolHandler = async (args, ctx) => {
  const sector = typeof args.sector === 'string' ? args.sector : undefined;
  const subsector = typeof args.subsector === 'string' ? args.subsector : undefined;
  const detail_level =
    typeof args.detail_level === 'string' ? args.detail_level : 'full';

  if (!sector || !VALID_SECTORS.includes(sector as (typeof VALID_SECTORS)[number])) {
    return errorResult(
      `check_applicability: sector is required and must be one of: ${VALID_SECTORS.join(', ')}`,
    );
  }

  const sql = `
    SELECT
      regulation,
      confidence,
      basis_article AS basis,
      notes
    FROM applicability_rules
    WHERE applies = 1
      AND (
        (sector = ? AND (subsector IS NULL OR subsector = ?))
        OR (sector = ? AND subsector IS NULL)
      )
    ORDER BY regulation,
      CASE confidence
        WHEN 'definite' THEN 1
        WHEN 'likely' THEN 2
        WHEN 'possible' THEN 3
      END
  `;

  try {
    const rows = ctx.db.prepare(sql).all(sector, subsector ?? '', sector) as ApplicabilityRow[];

    const regulationMap = new Map<string, ApplicabilityRow>();
    for (const row of rows) {
      if (!regulationMap.has(row.regulation)) {
        regulationMap.set(row.regulation, row);
      }
    }
    const applicable_regulations = Array.from(regulationMap.values());

    if (detail_level === 'summary') {
      const by_confidence = {
        definite: applicable_regulations.filter((r) => r.confidence === 'definite').length,
        likely: applicable_regulations.filter((r) => r.confidence === 'likely').length,
        possible: applicable_regulations.filter((r) => r.confidence === 'possible').length,
      };
      const regulations_summary = applicable_regulations.map((r) => ({
        id: r.regulation,
        confidence: r.confidence,
        basis: r.basis,
        notes: r.notes,
        priority_deadline: PRIORITY_DEADLINES[r.regulation],
      }));
      return textResult({
        entity: { sector, subsector, detail_level },
        applicable_regulations,
        summary: {
          total_count: applicable_regulations.length,
          by_confidence,
          regulations_summary,
          next_steps:
            "For full article-level detail, use detail_level='full'. Per regulation, call get_provision (chassis tool) for the specific articles in `basis`.",
        },
      });
    }

    return textResult({
      entity: { sector, subsector, detail_level },
      applicable_regulations,
    });
  } catch (e) {
    return errorResult(`check_applicability: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const checkApplicabilityTool: ExtensionTool = {
  definition: {
    name: 'check_applicability',
    description:
      'Determine which EU regulations apply to an entity based on its sector and optional subsector. Returns applicable regulations with confidence levels (definite / likely / possible), the basis article, and contextual notes. detail_level=summary adds counts + priority deadlines.',
    inputSchema: {
      type: 'object',
      properties: {
        sector: {
          type: 'string',
          enum: [...VALID_SECTORS],
          description: 'Primary sector of the entity.',
        },
        subsector: {
          type: 'string',
          description:
            'Optional subsector for tighter scoping (e.g. "banking", "insurance" under financial).',
        },
        detail_level: {
          type: 'string',
          enum: ['summary', 'full'],
          description:
            'summary = counts + deadlines. full (default) = applicable_regulations list only.',
        },
      },
      required: ['sector'],
    },
  },
  handler,
};
