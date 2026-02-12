/**
 * SQLite Database Adapter
 *
 * Wraps better-sqlite3 to implement the DatabaseAdapter interface.
 * Used by MCP server (maintains backward compatibility with existing users).
 */

import Database from 'better-sqlite3';
import type { DatabaseAdapter } from './database-adapter.js';
import type {
  Regulation,
  Article,
  Recital,
  Definition,
  ControlMapping,
  ApplicabilityRule,
  SearchResult
} from '../types/index.js';

export class SQLiteAdapter implements DatabaseAdapter {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath, { readonly: true });
  }

  // ===== CONNECTION MANAGEMENT =====

  async testConnection(): Promise<boolean> {
    try {
      const result = this.db.prepare('SELECT 1 as test').get() as { test: number };
      return result.test === 1;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    this.db.close();
  }

  // ===== REGULATIONS =====

  async getAllRegulations(): Promise<Regulation[]> {
    return this.db.prepare(`
      SELECT id, full_name, celex_id, effective_date, last_amended, eur_lex_url
      FROM regulations
      ORDER BY id
    `).all() as Regulation[];
  }

  async getRegulationById(id: string): Promise<Regulation | null> {
    const result = this.db.prepare(`
      SELECT id, full_name, celex_id, effective_date, last_amended, eur_lex_url
      FROM regulations
      WHERE id = ?
    `).get(id) as Regulation | undefined;

    return result || null;
  }

  // ===== ARTICLES =====

  async searchArticles(
    query: string,
    regulations?: string[],
    limit: number = 10
  ): Promise<SearchResult<Article>[]> {
    // Sanitize query for FTS5: replace hyphens with spaces, escape special chars
    const sanitizedQuery = query
      .replace(/-/g, ' ')           // hyphens become spaces (FTS5 treats - as NOT)
      .replace(/['"(){}[\]^~*:]/g, ' ')  // remove other FTS5 special chars
      .replace(/\s+/g, ' ')         // collapse multiple spaces
      .trim();

    let sql = `
      SELECT
        a.rowid, a.regulation, a.article_number, a.title, a.text, a.chapter,
        bm25(articles_fts) AS rank
      FROM articles_fts
      JOIN articles a ON articles_fts.rowid = a.rowid
      WHERE articles_fts MATCH ?
    `;

    const params: any[] = [sanitizedQuery];

    if (regulations && regulations.length > 0) {
      const placeholders = regulations.map(() => '?').join(',');
      sql += ` AND a.regulation IN (${placeholders})`;
      params.push(...regulations);
    }

    sql += ` ORDER BY rank LIMIT ?`;
    params.push(limit);

    const results = this.db.prepare(sql).all(...params) as (Article & { rank: number; rowid: number })[];

    return results.map(row => ({
      item: {
        id: row.rowid,
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
    const result = this.db.prepare(`
      SELECT rowid as id, regulation, article_number, title, text, chapter, recitals, cross_references
      FROM articles
      WHERE regulation = ? AND article_number = ?
    `).get(regulation, articleNumber) as Article | undefined;

    return result || null;
  }

  async getArticlesByRegulation(regulation: string): Promise<Article[]> {
    return this.db.prepare(`
      SELECT rowid as id, regulation, article_number, title, text, chapter
      FROM articles
      WHERE regulation = ?
      ORDER BY CAST(article_number AS INTEGER), article_number
    `).all(regulation) as Article[];
  }

  // ===== RECITALS =====

  async getRecital(regulation: string, recitalNumber: number): Promise<Recital | null> {
    const result = this.db.prepare(`
      SELECT id, regulation, recital_number, text, related_articles
      FROM recitals
      WHERE regulation = ? AND recital_number = ?
    `).get(regulation, recitalNumber) as Recital | undefined;

    return result || null;
  }

  async getRecitalsByRegulation(regulation: string): Promise<Recital[]> {
    return this.db.prepare(`
      SELECT id, regulation, recital_number, text, related_articles
      FROM recitals
      WHERE regulation = ?
      ORDER BY recital_number
    `).all(regulation) as Recital[];
  }

  async searchRecitals(query: string, limit: number = 10): Promise<SearchResult<Recital>[]> {
    const results = this.db.prepare(`
      SELECT
        r.id, r.regulation, r.recital_number, r.text,
        bm25(recitals_fts) AS rank
      FROM recitals_fts
      JOIN recitals r ON recitals_fts.rowid = r.id
      WHERE recitals_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit) as (Recital & { rank: number })[];

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
      sql += ` AND LOWER(term) LIKE LOWER(?)`;
      params.push(`%${term}%`);
    }

    if (regulation) {
      sql += ` AND regulation = ?`;
      params.push(regulation);
    }

    sql += ` ORDER BY regulation, term`;

    return this.db.prepare(sql).all(...params) as Definition[];
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
      WHERE framework = ?
    `;
    const params: any[] = [framework];

    if (controlId) {
      sql += ` AND control_id = ?`;
      params.push(controlId);
    }

    if (regulation) {
      sql += ` AND regulation = ?`;
      params.push(regulation);
    }

    sql += ` ORDER BY control_id, regulation`;

    return this.db.prepare(sql).all(...params) as ControlMapping[];
  }

  // ===== APPLICABILITY RULES =====

  async getApplicabilityRules(
    sector: string,
    subsector?: string
  ): Promise<ApplicabilityRule[]> {
    let sql = `
      SELECT id, regulation, sector, subsector, applies, confidence, basis_article, notes
      FROM applicability_rules
      WHERE sector = ?
    `;
    const params: any[] = [sector];

    if (subsector) {
      sql += ` AND (subsector = ? OR subsector IS NULL)`;
      params.push(subsector);
    }

    sql += ` ORDER BY regulation`;

    return this.db.prepare(sql).all(...params) as ApplicabilityRule[];
  }

  // ===== STATISTICS =====

  async getStatistics() {
    const regulations = this.db.prepare('SELECT COUNT(*) as count FROM regulations').get() as { count: number };
    const articles = this.db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number };
    const recitals = this.db.prepare('SELECT COUNT(*) as count FROM recitals').get() as { count: number };
    const definitions = this.db.prepare('SELECT COUNT(*) as count FROM definitions').get() as { count: number };
    const mappings = this.db.prepare('SELECT COUNT(*) as count FROM control_mappings').get() as { count: number };

    return {
      regulations: regulations.count,
      articles: articles.count,
      recitals: recitals.count,
      definitions: definitions.count,
      control_mappings: mappings.count
    };
  }
}
