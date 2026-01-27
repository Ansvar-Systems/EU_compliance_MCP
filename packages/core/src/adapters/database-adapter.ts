/**
 * Database Adapter Interface
 *
 * Defines the contract that both SQLite and PostgreSQL adapters must implement.
 * This allows the service layer to be database-agnostic.
 */

import type {
  Regulation,
  Article,
  Recital,
  Definition,
  ControlMapping,
  ApplicabilityRule,
  SearchResult
} from '../types/index.js';

export interface DatabaseAdapter {
  // ===== CONNECTION MANAGEMENT =====

  /**
   * Test database connection health
   */
  testConnection(): Promise<boolean>;

  /**
   * Close database connection
   */
  close(): Promise<void>;

  // ===== REGULATIONS =====

  /**
   * Get all regulations
   */
  getAllRegulations(): Promise<Regulation[]>;

  /**
   * Get regulation by ID
   */
  getRegulationById(id: string): Promise<Regulation | null>;

  // ===== ARTICLES =====

  /**
   * Full-text search across articles
   */
  searchArticles(
    query: string,
    regulations?: string[],
    limit?: number
  ): Promise<SearchResult<Article>[]>;

  /**
   * Get specific article
   */
  getArticle(regulation: string, articleNumber: string): Promise<Article | null>;

  /**
   * Get all articles for a regulation
   */
  getArticlesByRegulation(regulation: string): Promise<Article[]>;

  // ===== RECITALS =====

  /**
   * Get specific recital
   */
  getRecital(regulation: string, recitalNumber: number): Promise<Recital | null>;

  /**
   * Get all recitals for a regulation
   */
  getRecitalsByRegulation(regulation: string): Promise<Recital[]>;

  /**
   * Search recitals by text
   */
  searchRecitals(query: string, limit?: number): Promise<SearchResult<Recital>[]>;

  // ===== DEFINITIONS =====

  /**
   * Get definitions (optionally filtered by term and/or regulation)
   */
  getDefinitions(term?: string, regulation?: string): Promise<Definition[]>;

  // ===== CONTROL MAPPINGS =====

  /**
   * Get control mappings
   */
  getControlMappings(
    framework: 'ISO27001' | 'NIST_CSF',
    controlId?: string,
    regulation?: string
  ): Promise<ControlMapping[]>;

  // ===== APPLICABILITY RULES =====

  /**
   * Get applicability rules for a sector
   */
  getApplicabilityRules(
    sector: string,
    subsector?: string
  ): Promise<ApplicabilityRule[]>;

  // ===== STATISTICS =====

  /**
   * Get database statistics
   */
  getStatistics(): Promise<{
    regulations: number;
    articles: number;
    recitals: number;
    definitions: number;
    control_mappings: number;
  }>;
}
