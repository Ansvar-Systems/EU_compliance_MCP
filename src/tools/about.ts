import type { DatabaseAdapter } from '../database/types.js';

export interface AboutContext {
  version: string;
  fingerprint: string;
  dbBuilt: string;
}

export interface AboutResult {
  server: {
    name: string;
    package: string;
    version: string;
    suite: string;
    repository: string;
  };
  dataset: {
    fingerprint: string;
    built: string;
    jurisdiction: string;
    content_basis: string;
    counts: Record<string, number>;
    freshness: {
      last_checked: string | null;
      check_method: string;
      source_registry_entries: number;
    };
  };
  provenance: {
    sources: string[];
    license: string;
    authenticity_note: string;
  };
  security: {
    access_model: string;
    network_access: boolean;
    filesystem_access: boolean;
    arbitrary_execution: boolean;
  };
}

export async function getAbout(
  db: DatabaseAdapter,
  context: AboutContext
): Promise<AboutResult> {
  // Run all count queries in parallel
  const [
    regulationsResult,
    articlesResult,
    recitalsResult,
    definitionsResult,
    controlMappingsResult,
    applicabilityResult,
    evidenceResult,
    freshnessResult,
  ] = await Promise.all([
    db.query('SELECT COUNT(*) as count FROM regulations'),
    db.query('SELECT COUNT(*) as count FROM articles'),
    db.query('SELECT COUNT(*) as count FROM recitals'),
    db.query('SELECT COUNT(*) as count FROM definitions'),
    db.query('SELECT COUNT(*) as count FROM control_mappings'),
    db.query('SELECT COUNT(*) as count FROM applicability_rules'),
    db.query('SELECT COUNT(*) as count FROM evidence_requirements').catch(() => ({ rows: [{ count: 0 }] })),
    db.query('SELECT COUNT(*) as entry_count, MAX(last_fetched) as last_checked FROM source_registry').catch(() => ({ rows: [{ entry_count: 0, last_checked: null }] })),
  ]);

  const counts: Record<string, number> = {
    regulations: Number(regulationsResult.rows[0].count),
    articles: Number(articlesResult.rows[0].count),
    recitals: Number(recitalsResult.rows[0].count),
    definitions: Number(definitionsResult.rows[0].count),
    control_mappings: Number(controlMappingsResult.rows[0].count),
    applicability_rules: Number(applicabilityResult.rows[0].count),
    evidence_requirements: Number(evidenceResult.rows[0].count),
  };

  const freshnessRow = freshnessResult.rows[0] as { entry_count: number; last_checked: string | null };

  return {
    server: {
      name: 'EU Regulations MCP',
      package: '@ansvar/eu-regulations-mcp',
      version: context.version,
      suite: 'Ansvar Compliance Suite',
      repository: 'https://github.com/Ansvar-Systems/EU_compliance_MCP',
    },
    dataset: {
      fingerprint: context.fingerprint,
      built: context.dbBuilt,
      jurisdiction: 'EU',
      content_basis:
        'EUR-Lex consolidated texts with amendments applied as of build date. ' +
        'Original OJ text used where no consolidation exists (e.g., DORA RTS/ITS). ' +
        'Not an official legal publication.',
      counts,
      freshness: {
        last_checked: freshnessRow.last_checked,
        check_method: 'Daily EUR-Lex RSS + version comparison',
        source_registry_entries: Number(freshnessRow.entry_count),
      },
    },
    provenance: {
      sources: ['EUR-Lex', 'UNECE'],
      license:
        'Apache-2.0 (server code). EU legal documents reusable under EUR-Lex reuse policy; ' +
        'editorial content under CC BY 4.0.',
      authenticity_note:
        'Only documents published in the Official Journal of the EU are deemed authentic ' +
        '(Article 297 TFEU). This dataset is derived from EUR-Lex and should be verified ' +
        'against official publications for legal purposes.',
    },
    security: {
      access_model: 'read-only',
      network_access: false,
      filesystem_access: false,
      arbitrary_execution: false,
    },
  };
}
