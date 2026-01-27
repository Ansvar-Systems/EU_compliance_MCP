/**
 * SQL queries for PostgreSQL database
 */

import { DatabaseConnection } from './connection.js';
import type {
  Regulation,
  Article,
  Recital,
  Definition,
  ControlMapping,
  ApplicabilityRule,
  SearchResult
} from '../types/index.js';

export class DatabaseQueries {
  constructor(private db: DatabaseConnection) {}

  // ===== REGULATIONS =====

  async getAllRegulations(): Promise<Regulation[]> {
    return this.db.query<Regulation>(`
      SELECT id, full_name, celex_id, effective_date, last_amended, eur_lex_url
      FROM regulations
      ORDER BY id
    `);
  }

  async getRegulationById(id: string): Promise<Regulation | null> {
    return this.db.queryOne<Regulation>(`
      SELECT id, full_name, celex_id, effective_date, last_amended, eur_lex_url
      FROM regulations
      WHERE id = $1
    `, [id]);
  }

  // ===== ARTICLES =====

  async searchArticles(
    query: string,
    regulations?: string[],
    limit: number = 10
  ): Promise<SearchResult<Article>[]> {
    const tsQuery = query.trim().split(/\s+/).join(' & ');

    let sql = `
      SELECT
        id, regulation, article_number, title, text, chapter,
        ts_rank(
          to_tsvector('english', COALESCE(title, '') || ' ' || text),
          to_tsquery('english', $1)
        ) AS rank
      FROM articles
      WHERE to_tsvector('english', COALESCE(title, '') || ' ' || text)
            @@ to_tsquery('english', $1)
    `;

    const params: any[] = [tsQuery];

    if (regulations && regulations.length > 0) {
      sql += ` AND regulation = ANY($2)`;
      params.push(regulations);
    }

    sql += ` ORDER BY rank DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const results = await this.db.query<Article & { rank: number }>(sql, params);

    return results.map(row => ({
      item: {
        id: row.id,
        regulation: row.regulation,
        article_number: row.article_number,
        title: row.title,
        text: row.text,
        chapter: row.chapter
      },
      rank: row.rank
    }));
  }

  async getArticle(regulation: string, articleNumber: string): Promise<Article | null> {
    return this.db.queryOne<Article>(`
      SELECT id, regulation, article_number, title, text, chapter, recitals, cross_references
      FROM articles
      WHERE regulation = $1 AND article_number = $2
    `, [regulation, articleNumber]);
  }

  async getArticlesByRegulation(regulation: string): Promise<Article[]> {
    return this.db.query<Article>(`
      SELECT id, regulation, article_number, title, text, chapter
      FROM articles
      WHERE regulation = $1
      ORDER BY CAST(article_number AS INTEGER), article_number
    `, [regulation]);
  }

  // ===== RECITALS =====

  async getRecital(regulation: string, recitalNumber: number): Promise<Recital | null> {
    return this.db.queryOne<Recital>(`
      SELECT id, regulation, recital_number, text, related_articles
      FROM recitals
      WHERE regulation = $1 AND recital_number = $2
    `, [regulation, recitalNumber]);
  }

  async getRecitalsByRegulation(regulation: string): Promise<Recital[]> {
    return this.db.query<Recital>(`
      SELECT id, regulation, recital_number, text, related_articles
      FROM recitals
      WHERE regulation = $1
      ORDER BY recital_number
    `, [regulation]);
  }

  async searchRecitals(query: string, limit: number = 10): Promise<SearchResult<Recital>[]> {
    const tsQuery = query.trim().split(/\s+/).join(' & ');

    const results = await this.db.query<Recital & { rank: number }>(`
      SELECT
        id, regulation, recital_number, text,
        ts_rank(
          to_tsvector('english', text),
          to_tsquery('english', $1)
        ) AS rank
      FROM recitals
      WHERE to_tsvector('english', text) @@ to_tsquery('english', $1)
      ORDER BY rank DESC
      LIMIT $2
    `, [tsQuery, limit]);

    return results.map(row => ({
      item: {
        id: row.id,
        regulation: row.regulation,
        recital_number: row.recital_number,
        text: row.text
      },
      rank: row.rank
    }));
  }

  // ===== DEFINITIONS =====

  async getDefinitions(term?: string, regulation?: string): Promise<Definition[]> {
    let sql = `
      SELECT id, regulation, term, definition, article
      FROM definitions
      WHERE 1=1
    `;
    const params: any[] = [];

    if (term) {
      params.push(`%${term.toLowerCase()}%`);
      sql += ` AND LOWER(term) LIKE $${params.length}`;
    }

    if (regulation) {
      params.push(regulation);
      sql += ` AND regulation = $${params.length}`;
    }

    sql += ` ORDER BY regulation, term`;

    return this.db.query<Definition>(sql, params);
  }

  // ===== CONTROL MAPPINGS =====

  async getControlMappings(
    framework: 'ISO27001' | 'NIST_CSF',
    controlId?: string,
    regulation?: string
  ): Promise<ControlMapping[]> {
    let sql = `
      SELECT id, framework, control_id, control_name, regulation, articles, coverage, notes
      FROM control_mappings
      WHERE framework = $1
    `;
    const params: any[] = [framework];

    if (controlId) {
      params.push(controlId);
      sql += ` AND control_id = $${params.length}`;
    }

    if (regulation) {
      params.push(regulation);
      sql += ` AND regulation = $${params.length}`;
    }

    sql += ` ORDER BY control_id, regulation`;

    return this.db.query<ControlMapping>(sql, params);
  }

  // ===== APPLICABILITY RULES =====

  async getApplicabilityRules(
    sector: string,
    subsector?: string
  ): Promise<ApplicabilityRule[]> {
    let sql = `
      SELECT id, regulation, sector, subsector, applies, confidence, basis_article, notes
      FROM applicability_rules
      WHERE sector = $1
    `;
    const params: any[] = [sector];

    if (subsector) {
      params.push(subsector);
      sql += ` AND (subsector = $${params.length} OR subsector IS NULL)`;
    }

    sql += ` ORDER BY regulation`;

    return this.db.query<ApplicabilityRule>(sql, params);
  }

  // ===== STATISTICS =====

  async getStatistics() {
    const [regulations, articles, recitals, definitions, mappings] = await Promise.all([
      this.db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM regulations'),
      this.db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM articles'),
      this.db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM recitals'),
      this.db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM definitions'),
      this.db.queryOne<{ count: string }>('SELECT COUNT(*) as count FROM control_mappings')
    ]);

    return {
      regulations: parseInt(regulations?.count || '0'),
      articles: parseInt(articles?.count || '0'),
      recitals: parseInt(recitals?.count || '0'),
      definitions: parseInt(definitions?.count || '0'),
      control_mappings: parseInt(mappings?.count || '0')
    };
  }
}
