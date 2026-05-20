import type { DatabaseAdapter } from '../database/types.js';

// --- Types ---

export interface GetArticleHistoryInput {
  regulation: string;
  article: string;
}

export interface DiffArticleInput {
  regulation: string;
  article: string;
  from_date: string;
  to_date?: string;
}

export interface GetRecentChangesInput {
  regulation?: string;
  since: string;
  limit?: number;
}

interface ArticleVersion {
  effective_date: string | null;
  superseded_date: string | null;
  change_summary: string | null;
  source_url: string | null;
}

interface ArticleHistory {
  regulation: string;
  article: string;
  current_version: string | null;
  versions: ArticleVersion[];
}

interface ArticleDiff {
  regulation: string;
  article: string;
  from_date: string;
  to_date: string;
  diff: string | null;
  change_summary: string | null;
}

interface RecentChange {
  regulation: string;
  article: string;
  effective_date: string;
  change_summary: string | null;
  source_url: string | null;
}

async function hasVersionsTable(db: DatabaseAdapter): Promise<boolean> {
  const result = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='article_versions'",
  );
  return result.rows.length > 0;
}

// --- Handlers ---

export async function getArticleHistory(
  db: DatabaseAdapter,
  input: GetArticleHistoryInput,
): Promise<ArticleHistory> {
  if (!(await hasVersionsTable(db))) {
    throw new Error('Version tracking data not available in this database build.');
  }

  const { regulation, article } = input;

  // Find the parent article
  const articleResult = await db.query<{ rowid: number }>(
    'SELECT rowid FROM articles WHERE regulation = $1 AND article_number = $2',
    [regulation, article],
  );

  if (articleResult.rows.length === 0) {
    throw new Error(`Article ${article} not found in ${regulation}`);
  }

  const articleId = articleResult.rows[0].rowid;

  const versions = await db.query<{
    effective_date: string | null;
    superseded_date: string | null;
    change_summary: string | null;
    source_url: string | null;
  }>(
    `SELECT effective_date, superseded_date, change_summary, source_url
     FROM article_versions
     WHERE article_id = $1
     ORDER BY effective_date ASC`,
    [articleId],
  );

  const currentVersion =
    versions.rows.length > 0
      ? versions.rows[versions.rows.length - 1].effective_date
      : null;

  return {
    regulation,
    article,
    current_version: currentVersion,
    versions: versions.rows,
  };
}

export async function diffArticle(
  db: DatabaseAdapter,
  input: DiffArticleInput,
): Promise<ArticleDiff> {
  if (!(await hasVersionsTable(db))) {
    throw new Error('Version tracking data not available in this database build.');
  }

  const { regulation, article, from_date, to_date } = input;
  const effectiveToDate = to_date ?? new Date().toISOString().slice(0, 10);

  const articleResult = await db.query<{ rowid: number }>(
    'SELECT rowid FROM articles WHERE regulation = $1 AND article_number = $2',
    [regulation, article],
  );

  if (articleResult.rows.length === 0) {
    throw new Error(`Article ${article} not found in ${regulation}`);
  }

  const articleId = articleResult.rows[0].rowid;

  // Find the version closest to the to_date that has a diff
  const diffResult = await db.query<{
    diff_from_previous: string | null;
    change_summary: string | null;
    effective_date: string | null;
  }>(
    `SELECT diff_from_previous, change_summary, effective_date
     FROM article_versions
     WHERE article_id = $1
       AND effective_date > $2
       AND effective_date <= $3
     ORDER BY effective_date DESC
     LIMIT 1`,
    [articleId, from_date, effectiveToDate],
  );

  if (diffResult.rows.length === 0) {
    return {
      regulation,
      article,
      from_date,
      to_date: effectiveToDate,
      diff: null,
      change_summary: 'No changes found in this date range.',
    };
  }

  const row = diffResult.rows[0];
  return {
    regulation,
    article,
    from_date,
    to_date: effectiveToDate,
    diff: row.diff_from_previous,
    change_summary: row.change_summary,
  };
}

export async function getRecentChanges(
  db: DatabaseAdapter,
  input: GetRecentChangesInput,
): Promise<{ since: string; changes: RecentChange[]; total: number }> {
  if (!(await hasVersionsTable(db))) {
    throw new Error('Version tracking data not available in this database build.');
  }

  const { regulation, since, limit } = input;
  const effectiveLimit = Math.min(limit ?? 50, 200);

  let sql = `
    SELECT
      a.regulation,
      a.article_number AS article,
      v.effective_date,
      v.change_summary,
      v.source_url
    FROM article_versions v
    JOIN articles a ON a.rowid = v.article_id
    WHERE v.effective_date >= $1
  `;
  const params: (string | number)[] = [since];

  if (regulation) {
    sql += ` AND a.regulation = $${params.length + 1}`;
    params.push(regulation);
  }

  sql += ` ORDER BY v.effective_date DESC LIMIT $${params.length + 1}`;
  params.push(effectiveLimit);

  const result = await db.query<RecentChange>(sql, params);

  return {
    since,
    changes: result.rows,
    total: result.rows.length,
  };
}
