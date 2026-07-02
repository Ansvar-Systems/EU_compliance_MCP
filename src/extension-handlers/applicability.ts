import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';
import type { CitationEnvelope, CitationManifest } from './citation.js';
import { createCitationResolver } from './instrument-citation.js';

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

// One applicable regulation, on the standard envelope shape. Field names
// (regulation / confidence / basis / notes) are unchanged from the legacy
// applicable_regulations rows so row-level consumer access keeps working.
interface ApplicabilityResult extends ApplicabilityRow {
  priority_deadline?: string;
  _citation: CitationEnvelope;
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

    // Per-row _citation: the basis article's provision when it exists in the
    // corpus (EUR-Lex ELI + #art_N anchor), otherwise the instrument's ELI
    // (:meta row). An applicability verdict whose regulation cannot be cited
    // from the corpus at all is skipped-and-counted, never served uncited
    // (no fabrication, conformance I5 — mirrors compare_requirements).
    const resolver = createCitationResolver(ctx.db, (ctx.manifest ?? {}) as CitationManifest);
    const results: ApplicabilityResult[] = [];
    const omitted: string[] = [];
    for (const row of regulationMap.values()) {
      const resolved = resolver.resolve(row.regulation, row.basis);
      if (!resolved) {
        omitted.push(row.regulation);
        continue;
      }
      const result: ApplicabilityResult = { ...row, _citation: resolved.citation };
      const deadline = PRIORITY_DEADLINES[row.regulation];
      if (deadline) result.priority_deadline = deadline;
      results.push(result);
    }

    // Honest signal (conformance I1/I2): an empty verdict set must never read
    // as a silent zero. `partial` stays false — no applicable rules is a true
    // zero-match, not a downstream-availability degradation.
    const messageParts: string[] = [];
    if (results.length === 0 && omitted.length === 0) {
      messageParts.push(
        `No applicability rules matched sector "${sector}"${subsector ? ` / subsector "${subsector}"` : ''}. ` +
          'The applicability table may not cover this sector yet — treat as unassessed, not as "no obligations".',
      );
    }
    if (omitted.length > 0) {
      messageParts.push(
        `${omitted.length} applicable regulation(s) omitted (incomplete source attribution): ${omitted.join(', ')}. ` +
          'Verify these regulations directly before treating this list as complete.',
      );
    }

    const by_confidence = {
      definite: results.filter((r) => r.confidence === 'definite').length,
      likely: results.filter((r) => r.confidence === 'likely').length,
      possible: results.filter((r) => r.confidence === 'possible').length,
    };

    const meta: Record<string, unknown> = {
      entity: { sector, subsector, detail_level },
      total_count: results.length,
      by_confidence,
      partial: false,
      message: messageParts.join(' '),
    };
    if (detail_level === 'summary') {
      meta.next_steps =
        "For full article-level detail, use detail_level='full'. Per regulation, call get_provision (chassis tool) for the specific articles in `basis`.";
    }

    return textResult({ results, meta });
  } catch (e) {
    return errorResult(`check_applicability: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const checkApplicabilityTool: ExtensionTool = {
  definition: {
    name: 'check_applicability',
    description:
      'Determine which EU regulations apply to an entity based on its sector and optional subsector. Returns a {results, meta} envelope: one cited row per applicable regulation with confidence level (definite / likely / possible), the basis article, contextual notes, and a source_url/publisher/license _citation to the basis provision (or the instrument when the basis article is not provision-addressable). meta carries entity scope + confidence counts; detail_level=summary adds next steps.',
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
            'summary adds meta.next_steps; full (default) returns the cited rows + counts.',
        },
      },
      required: ['sector'],
    },
  },
  handler,
};
