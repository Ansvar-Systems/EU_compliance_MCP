import type { DatabaseAdapter } from '../database/types.js';

export interface SourceRegistryEntry {
  source_id: string;
  url: string | null;
  last_fetched: string | null;
  status: string | null;
}

export interface DataFreshnessResult {
  last_checked: string | null;
  check_method: string;
  source_registry_entries: number;
  sources: SourceRegistryEntry[];
  dataset_built: string | null;
  note: string;
}

export async function checkDataFreshness(db: DatabaseAdapter): Promise<DataFreshnessResult> {
  const NOTE =
    'Freshness reflects the last EUR-Lex RSS check. Regulation text is updated when the ' +
    'EUR-Lex consolidation version changes. Run `about` for full dataset provenance.';

  try {
    const result = await db.query<SourceRegistryEntry>(
      `SELECT source_id, url, last_fetched, status
       FROM source_registry
       ORDER BY last_fetched DESC`,
    );

    const rows = result.rows;
    const lastChecked = rows.length > 0 ? rows[0].last_fetched : null;

    return {
      last_checked: lastChecked,
      check_method: 'Daily EUR-Lex RSS + version comparison',
      source_registry_entries: rows.length,
      sources: rows,
      dataset_built: null,
      note: NOTE,
    };
  } catch {
    // source_registry table may not exist in all deployments
    return {
      last_checked: null,
      check_method: 'Daily EUR-Lex RSS + version comparison',
      source_registry_entries: 0,
      sources: [],
      dataset_built: null,
      note: NOTE + ' Source registry not available in this deployment.',
    };
  }
}
