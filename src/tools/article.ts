import type { DatabaseAdapter } from '../database/types.js';
import { buildCitation } from '../utils/citation.js';
import {
  buildArticleSourceUrl,
  buildRecitalSourceUrl,
} from '../utils/eur-lex-url.js';

/**
 * Normalize user input for the `article` parameter of get_article.
 *
 * Numeric articles ("1", "113", "5a") pass through after trimming.
 * Annex references are normalized to the canonical stored form "Annex <ROMAN>":
 * underscores become spaces, whitespace is collapsed, case is folded so "Annex"
 * is title case and the Roman numeral is uppercase.
 * Recital references ("Recital 75", "recital_75", "Rct 75") are normalized to
 * "Recital N" so callers of get_article (notably the gateway's get_provision
 * tool) can address recitals without a separate parameter. D5 (DPIA workflow).
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

  // Match "recital"/"rct"/"rct." followed by an integer. The corpus stores
  // recital numbers separately in the `recitals` table; this branch
  // normalizes the user-facing alias so getArticle can route correctly.
  const recitalMatch = collapsed.match(/^(?:recital|rct\.?)\s+(\d+)$/i);
  if (recitalMatch) {
    return `Recital ${recitalMatch[1]}`;
  }

  // Strip "Article"/"Art."/"Art" prefix — DB stores bare numbers.
  const articleMatch = collapsed.match(/^art(?:icle)?\.?\s+(.+)$/i);
  if (articleMatch) {
    return articleMatch[1];
  }

  return collapsed;
}

/**
 * Detect the canonical "Recital N" form produced by normalizeArticleNumber.
 * Returns the integer recital number, or null if input is not a recital ref.
 */
function parseRecitalNumber(article: string): number | null {
  const match = article.match(/^Recital (\d+)$/);
  if (!match) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
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

  // Schema marks both regulation and article required; SDK doesn't
  // validate. Pre-fix, a non-string ``article`` crashed
  // normalizeArticleNumber with "input.replace is not a function"
  // (2026-04-20 handler audit). Same class of bug as get_definitions.
  if (typeof regulation !== 'string') {
    throw new Error(
      'regulation is required: pass a regulation id (e.g. "GDPR", "NIS2", "DORA")',
    );
  }
  if (typeof input.article !== 'string') {
    throw new Error(
      'article is required: pass an article number or Annex reference (e.g. "32", "5a", "Annex I")',
    );
  }

  const article = normalizeArticleNumber(input.article);

  // D5 — recitals are addressable via get_article(article='Recital N') so
  // the gateway's get_provision tool (mapped directly to get_article) can
  // serve workflow prompts that cite recitals. The recitals table is
  // queried in place of `articles` and the result is wrapped in the Article
  // envelope so downstream consumers (citation chips, validate_citation)
  // see a uniform shape.
  const recitalNumber = parseRecitalNumber(article);
  if (recitalNumber !== null) {
    return getArticleAsRecital(db, regulation, recitalNumber);
  }

  const sql = `
    SELECT
      a.regulation,
      a.article_number,
      a.title,
      a.text,
      a.chapter,
      a.recitals,
      a.cross_references,
      r.celex_id,
      r.effective_date
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
    effective_date: string | null;
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
      undefined,
      row.effective_date,
    ),
  };
}

/**
 * Look up a recital by (regulation, recital_number) and wrap it in the
 * Article envelope so callers of get_article see a uniform shape.
 *
 * The `article_number` field is stamped "Recital N" — matching the form a
 * workflow author passes in get_article(article='Recital N'). Recitals do
 * not have chapter / cross_references / related-recital metadata; those
 * fields are null. `related_articles` from the recitals table is surfaced
 * via the existing `recitals` field of Article so a recital lookup tells
 * the consumer which articles the recital relates to.
 */
async function getArticleAsRecital(
  db: DatabaseAdapter,
  regulation: string,
  recitalNumber: number,
): Promise<Article | null> {
  const sql = `
    SELECT
      rc.regulation,
      rc.recital_number,
      rc.text,
      rc.related_articles,
      r.celex_id,
      r.effective_date
    FROM recitals rc
    LEFT JOIN regulations r ON r.id = rc.regulation
    WHERE rc.regulation = $1 AND rc.recital_number = $2
  `;

  const result = await db.query(sql, [regulation, recitalNumber]);

  if (result.rows.length === 0) {
    return null;
  }

  const row = result.rows[0] as {
    regulation: string;
    recital_number: number;
    text: string;
    related_articles: string | null;
    celex_id: string | null;
    effective_date: string | null;
  };

  const articleLabel = `Recital ${row.recital_number}`;
  const canonicalRef = `${row.regulation} Recital ${row.recital_number}`;

  return {
    regulation: row.regulation,
    article_number: articleLabel,
    title: null,
    text: row.text,
    chapter: null,
    recitals: row.related_articles ? JSON.parse(row.related_articles) : null,
    cross_references: null,
    _citation: buildCitation(
      canonicalRef,
      canonicalRef,
      'get_article',
      { regulation, article: articleLabel },
      buildRecitalSourceUrl(row.celex_id, row.recital_number),
      undefined,
      row.effective_date,
    ),
  };
}
