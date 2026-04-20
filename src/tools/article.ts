import type { DatabaseAdapter } from '../database/types.js';
import { buildCitation } from '../utils/citation.js';
import { buildArticleSourceUrl } from '../utils/eur-lex-url.js';

/**
 * Normalize user input for the `article` parameter of get_article.
 *
 * Numeric articles ("1", "113", "5a") pass through after trimming.
 * Annex references are normalized to the canonical stored form "Annex <ROMAN>":
 * underscores become spaces, whitespace is collapsed, case is folded so "Annex"
 * is title case and the Roman numeral is uppercase.
 *
 * Empty or whitespace-only input returns "".
 */
export function normalizeArticleNumber(input: string): string {
  if (!input) return '';

  // Collapse underscores to spaces, trim, collapse internal whitespace.
  const collapsed = input.replace(/_/g, ' ').trim().replace(/\s+/g, ' ');
  if (!collapsed) return '';

  // Match "annex" (any case) followed by a Roman numeral.
  const annexMatch = collapsed.match(/^annex\s+([ivxlcdm]+)$/i);
  if (annexMatch) {
    return `Annex ${annexMatch[1].toUpperCase()}`;
  }

  return collapsed;
}

export interface GetArticleInput {
  regulation: string;
  article: string;
  include_recitals?: boolean;
}

export interface Article {
  regulation: string;
  article_number: string;
  title: string | null;
  text: string;
  chapter: string | null;
  recitals: string[] | null;
  cross_references: string[] | null;
  truncated?: boolean;
  original_length?: number;
  token_estimate?: number;
  _citation?: ReturnType<typeof buildCitation>;
}

export async function getArticle(
  db: DatabaseAdapter,
  input: GetArticleInput
): Promise<Article | null> {
  const { regulation } = input;
  const article = normalizeArticleNumber(input.article);

  const sql = `
    SELECT
      a.regulation,
      a.article_number,
      a.title,
      a.text,
      a.chapter,
      a.recitals,
      a.cross_references,
      r.celex_id
    FROM articles a
    LEFT JOIN regulations r ON r.id = a.regulation
    WHERE a.regulation = $1 AND a.article_number = $2
  `;

  const result = await db.query(sql, [regulation, article]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as {
    regulation: string;
    article_number: string;
    title: string | null;
    text: string;
    chapter: string | null;
    recitals: string | null;
    cross_references: string | null;
    celex_id: string | null;
  };

  // Token management: Truncate very large articles to prevent context overflow
  const MAX_CHARS = 50000; // ~12,500 tokens (safe for 200k context window)
  const originalLength = row.text.length;
  const tokenEstimate = Math.ceil(originalLength / 4); // ~4 chars per token
  let text = row.text;
  let truncated = false;

  if (originalLength > MAX_CHARS) {
    text = row.text.substring(0, MAX_CHARS) + '\n\n[... Article truncated due to length. Original: ' + originalLength + ' chars (~' + tokenEstimate + ' tokens). Use search_regulations to find specific sections.]';
    truncated = true;
  }

  const displayText = row.title
    ? `${row.regulation} Article ${row.article_number} — ${row.title}`
    : `${row.regulation} Article ${row.article_number}`;

  return {
    regulation: row.regulation,
    article_number: row.article_number,
    title: row.title,
    text,
    chapter: row.chapter,
    recitals: row.recitals ? JSON.parse(row.recitals) : null,
    cross_references: row.cross_references ? JSON.parse(row.cross_references) : null,
    truncated,
    original_length: truncated ? originalLength : undefined,
    token_estimate: truncated ? tokenEstimate : undefined,
    _citation: buildCitation(
      `${row.regulation} Article ${row.article_number}`,
      displayText,
      'get_article',
      { regulation, article },
      buildArticleSourceUrl(row.celex_id, row.article_number),
    ),
  };
}
