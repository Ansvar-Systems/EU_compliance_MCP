import type { DatabaseAdapter } from '../database/types.js';

export interface SourceRegistryEntry {
  source_id: string;
  url: string | null;
  last_fetched: string | null;
  status: string | null;
}

export interface PendingPublication {
  id: string;
  title: string;
  issuing_body: string;
  status: 'planned' | 'draft';
  related_regulation: string;
  note?: string;
}

export interface GuidanceFreshnessBreakdown {
  total: number;
  by_status: Record<string, number>;
  by_issuing_body: Record<string, number>;
  pending_publications: PendingPublication[];
}

export interface DataFreshnessResult {
  last_checked: string | null;
  check_method: string;
  source_registry_entries: number;
  sources: SourceRegistryEntry[];
  guidance: GuidanceFreshnessBreakdown;
  dataset_built: string | null;
  note: string;
}

const EMPTY_GUIDANCE: GuidanceFreshnessBreakdown = {
  total: 0,
  by_status: {},
  by_issuing_body: {},
  pending_publications: [],
};

async function loadGuidanceBreakdown(
  db: DatabaseAdapter,
): Promise<GuidanceFreshnessBreakdown> {
  try {
    const statusResult = await db.query<{ status: string | null; cnt: number }>(
      `SELECT COALESCE(status, 'unknown') AS status, COUNT(*) AS cnt
       FROM guidance_documents
       GROUP BY status`,
    );
    const bodyResult = await db.query<{ issuing_body: string; cnt: number }>(
      `SELECT issuing_body, COUNT(*) AS cnt
       FROM guidance_documents
       GROUP BY issuing_body`,
    );
    const pendingResult = await db.query<{
      id: string;
      title: string;
      issuing_body: string;
      status: string;
      related_regulation: string;
      metadata: string | null;
    }>(
      `SELECT id, title, issuing_body, status, related_regulation, metadata
       FROM guidance_documents
       WHERE status IN ('planned', 'draft')
       ORDER BY id`,
    );

    const by_status: Record<string, number> = {};
    let total = 0;
    for (const row of statusResult.rows) {
      by_status[row.status ?? 'unknown'] = Number(row.cnt);
      total += Number(row.cnt);
    }

    const by_issuing_body: Record<string, number> = {};
    for (const row of bodyResult.rows) {
      by_issuing_body[row.issuing_body] = Number(row.cnt);
    }

    const pending_publications: PendingPublication[] = pendingResult.rows.map((row) => {
      let note: string | undefined;
      if (row.metadata) {
        try {
          const parsed = JSON.parse(row.metadata);
          if (typeof parsed?.freshness_note === 'string') note = parsed.freshness_note;
        } catch {
          // ignore malformed JSON
        }
      }
      return {
        id: row.id,
        title: row.title,
        issuing_body: row.issuing_body,
        status: row.status as 'planned' | 'draft',
        related_regulation: row.related_regulation,
        ...(note ? { note } : {}),
      };
    });

    return { total, by_status, by_issuing_body, pending_publications };
  } catch {
    return { ...EMPTY_GUIDANCE };
  }
}

export async function checkDataFreshness(db: DatabaseAdapter): Promise<DataFreshnessResult> {
  const NOTE =
    'Freshness reflects the last EUR-Lex RSS check and the last guidance ingestion run. ' +
    'Run `about` for full dataset provenance.';

  let sources: SourceRegistryEntry[] = [];
  let lastChecked: string | null = null;
  try {
    const result = await db.query<SourceRegistryEntry>(
      `SELECT source_id, url, last_fetched, status
       FROM source_registry
       ORDER BY last_fetched DESC`,
    );
    sources = result.rows;
    lastChecked = sources.length > 0 ? sources[0].last_fetched : null;
  } catch {
    // source_registry table may not exist in all deployments
  }

  const guidance = await loadGuidanceBreakdown(db);

  return {
    last_checked: lastChecked,
    check_method: 'Daily EUR-Lex RSS + version comparison; guidance ingestion as scheduled',
    source_registry_entries: sources.length,
    sources,
    guidance,
    dataset_built: null,
    note: NOTE,
  };
}
