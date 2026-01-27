/**
 * PostgreSQL Database Adapter
 *
 * Wraps PostgreSQL connection to implement the DatabaseAdapter interface.
 * Used by REST API for Teams/Copilot integration (scales to many concurrent users).
 */

import { DatabaseConnection, DatabaseQueries } from '../database/index.js';
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

export class PostgreSQLAdapter implements DatabaseAdapter {
  private connection: DatabaseConnection;
  private queries: DatabaseQueries;

  constructor(connectionString: string) {
    this.connection = new DatabaseConnection(connectionString);
    this.queries = new DatabaseQueries(this.connection);
  }

  // ===== CONNECTION MANAGEMENT =====

  async testConnection(): Promise<boolean> {
    return this.connection.testConnection();
  }

  async close(): Promise<void> {
    return this.connection.close();
  }

  // ===== REGULATIONS =====

  async getAllRegulations(): Promise<Regulation[]> {
    return this.queries.getAllRegulations();
  }

  async getRegulationById(id: string): Promise<Regulation | null> {
    return this.queries.getRegulationById(id);
  }

  // ===== ARTICLES =====

  async searchArticles(
    query: string,
    regulations?: string[],
    limit: number = 10
  ): Promise<SearchResult<Article>[]> {
    return this.queries.searchArticles(query, regulations, limit);
  }

  async getArticle(regulation: string, articleNumber: string): Promise<Article | null> {
    return this.queries.getArticle(regulation, articleNumber);
  }

  async getArticlesByRegulation(regulation: string): Promise<Article[]> {
    return this.queries.getArticlesByRegulation(regulation);
  }

  // ===== RECITALS =====

  async getRecital(regulation: string, recitalNumber: number): Promise<Recital | null> {
    return this.queries.getRecital(regulation, recitalNumber);
  }

  async getRecitalsByRegulation(regulation: string): Promise<Recital[]> {
    return this.queries.getRecitalsByRegulation(regulation);
  }

  async searchRecitals(query: string, limit: number = 10): Promise<SearchResult<Recital>[]> {
    return this.queries.searchRecitals(query, limit);
  }

  // ===== DEFINITIONS =====

  async getDefinitions(term?: string, regulation?: string): Promise<Definition[]> {
    return this.queries.getDefinitions(term, regulation);
  }

  // ===== CONTROL MAPPINGS =====

  async getControlMappings(
    framework: 'ISO27001' | 'NIST_CSF',
    controlId?: string,
    regulation?: string
  ): Promise<ControlMapping[]> {
    return this.queries.getControlMappings(framework, controlId, regulation);
  }

  // ===== APPLICABILITY RULES =====

  async getApplicabilityRules(
    sector: string,
    subsector?: string
  ): Promise<ApplicabilityRule[]> {
    return this.queries.getApplicabilityRules(sector, subsector);
  }

  // ===== STATISTICS =====

  async getStatistics() {
    return this.queries.getStatistics();
  }
}
