/**
 * Regulations Service
 *
 * Business logic layer extracted from src/tools/registry.ts.
 * Database-agnostic - works with both SQLite (MCP) and PostgreSQL (Teams).
 */

import type { DatabaseAdapter } from '../adapters/database-adapter.js';
import type {
  SearchParams,
  CompareParams,
  MapControlsParams,
  CheckApplicabilityParams
} from '../types/index.js';

export class RegulationsService {
  constructor(private db: DatabaseAdapter) {}

  /**
   * Search across all regulations for articles matching a query
   */
  async searchRegulations(params: SearchParams) {
    const { query, regulations, limit = 10 } = params;

    // Input validation
    if (!query || query.trim().length === 0) {
      throw new Error('Query parameter is required');
    }

    if (limit < 1 || limit > 50) {
      throw new Error('Limit must be between 1 and 50');
    }

    const results = await this.db.searchArticles(query, regulations, limit);

    return {
      query,
      regulations: regulations || ['all'],
      count: results.length,
      results: results.map(r => ({
        regulation: r.item.regulation,
        article: r.item.article_number,
        title: r.item.title,
        text: r.item.text,
        chapter: r.item.chapter,
        relevance: r.rank
      }))
    };
  }

  /**
   * Get a specific article
   */
  async getArticle(regulation: string, article: string) {
    // Input validation
    if (!regulation || !article) {
      throw new Error('Regulation and article parameters are required');
    }

    const result = await this.db.getArticle(regulation.toUpperCase(), article);

    if (!result) {
      throw new Error(`Article ${article} not found in ${regulation}`);
    }

    return {
      regulation: result.regulation,
      article: result.article_number,
      title: result.title,
      text: result.text,
      chapter: result.chapter,
      recitals: result.recitals ? result.recitals.split(',').map(n => parseInt(n.trim())) : [],
      cross_references: result.cross_references
    };
  }

  /**
   * Get a specific recital
   */
  async getRecital(regulation: string, recitalNumber: number) {
    // Input validation
    if (!regulation || recitalNumber === undefined) {
      throw new Error('Regulation and recital_number parameters are required');
    }

    if (recitalNumber < 1) {
      throw new Error('Recital number must be positive');
    }

    const result = await this.db.getRecital(regulation.toUpperCase(), recitalNumber);

    if (!result) {
      throw new Error(`Recital ${recitalNumber} not found in ${regulation}`);
    }

    return {
      regulation: result.regulation,
      recital_number: result.recital_number,
      text: result.text,
      related_articles: result.related_articles ? result.related_articles.split(',').map(n => n.trim()) : []
    };
  }

  /**
   * List available regulations or show detailed structure
   */
  async listRegulations(regulation?: string) {
    if (regulation) {
      // Get specific regulation with articles
      const reg = await this.db.getRegulationById(regulation.toUpperCase());
      if (!reg) {
        throw new Error(`Regulation ${regulation} not found`);
      }

      const articles = await this.db.getArticlesByRegulation(regulation.toUpperCase());

      return {
        regulation: reg.id,
        full_name: reg.full_name,
        celex_id: reg.celex_id,
        effective_date: reg.effective_date,
        article_count: articles.length,
        articles: articles.map(a => ({
          number: a.article_number,
          title: a.title,
          chapter: a.chapter
        }))
      };
    } else {
      // List all regulations
      const regulations = await this.db.getAllRegulations();
      const stats = await this.db.getStatistics();

      return {
        total: regulations.length,
        regulations: regulations.map(r => ({
          id: r.id,
          full_name: r.full_name,
          celex_id: r.celex_id,
          effective_date: r.effective_date
        })),
        statistics: stats
      };
    }
  }

  /**
   * Compare requirements across multiple regulations
   */
  async compareRequirements(params: CompareParams) {
    const { topic, regulations } = params;

    // Input validation
    if (!topic || topic.trim().length === 0) {
      throw new Error('Topic parameter is required');
    }

    if (!regulations || regulations.length < 2) {
      throw new Error('At least 2 regulations required for comparison');
    }

    // Search each regulation for the topic
    const comparisons = await Promise.all(
      regulations.map(async (reg) => {
        const results = await this.db.searchArticles(topic, [reg], 5);
        return {
          regulation: reg,
          articles: results.map(r => ({
            article: r.item.article_number,
            title: r.item.title,
            text: r.item.text.substring(0, 500) + '...',
            relevance: r.rank
          }))
        };
      })
    );

    return {
      topic,
      regulations,
      comparisons
    };
  }

  /**
   * Map security framework controls to regulation requirements
   */
  async mapControls(params: MapControlsParams) {
    const { framework, control, regulation } = params;

    // Input validation
    if (!framework || (framework !== 'ISO27001' && framework !== 'NIST_CSF')) {
      throw new Error('Framework must be ISO27001 or NIST_CSF');
    }

    const mappings = await this.db.getControlMappings(framework, control, regulation);

    return {
      framework,
      control: control || 'all',
      regulation: regulation || 'all',
      count: mappings.length,
      mappings: mappings.map(m => ({
        control_id: m.control_id,
        control_name: m.control_name,
        regulation: m.regulation,
        articles: m.articles,
        coverage: m.coverage,
        notes: m.notes
      }))
    };
  }

  /**
   * Determine which regulations apply to an organization
   */
  async checkApplicability(params: CheckApplicabilityParams) {
    const { sector, subsector, size, member_state } = params;

    // Input validation
    if (!sector) {
      throw new Error('Sector parameter is required');
    }

    const rules = await this.db.getApplicabilityRules(sector, subsector);

    return {
      sector,
      subsector: subsector || 'general',
      size,
      member_state,
      applicable_regulations: rules
        .filter(r => r.applies)
        .map(r => ({
          regulation: r.regulation,
          confidence: r.confidence,
          basis_article: r.basis_article,
          notes: r.notes
        })),
      not_applicable: rules
        .filter(r => !r.applies)
        .map(r => ({
          regulation: r.regulation,
          reason: r.notes
        }))
    };
  }

  /**
   * Get definitions from regulations
   */
  async getDefinitions(term?: string, regulation?: string) {
    const definitions = await this.db.getDefinitions(term, regulation);

    return {
      term: term || 'all',
      regulation: regulation || 'all',
      count: definitions.length,
      definitions: definitions.map(d => ({
        term: d.term,
        definition: d.definition,
        regulation: d.regulation,
        article: d.article
      }))
    };
  }
}
