/**
 * Shared TypeScript types for EU Regulations system
 */

export interface Regulation {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  last_amended?: string;
  eur_lex_url?: string;
}

export interface Article {
  id?: number;
  regulation: string;
  article_number: string;
  title?: string;
  text: string;
  chapter?: string;
  recitals?: string;
  cross_references?: string;
}

export interface Recital {
  id?: number;
  regulation: string;
  recital_number: number;
  text: string;
  related_articles?: string;
}

export interface Definition {
  id?: number;
  regulation: string;
  term: string;
  definition: string;
  article: string;
}

export interface ControlMapping {
  id?: number;
  framework: 'ISO27001' | 'NIST_CSF';
  control_id: string;
  control_name: string;
  regulation: string;
  articles: string;
  coverage?: 'full' | 'partial' | 'related';
  notes?: string;
}

export interface ApplicabilityRule {
  id?: number;
  regulation: string;
  sector: string;
  subsector?: string;
  applies: boolean;
  confidence?: 'definite' | 'likely' | 'possible';
  basis_article?: string;
  notes?: string;
}

export interface SourceRegistry {
  regulation: string;
  celex_id: string;
  eur_lex_version?: string;
  last_fetched?: string;
  articles_expected?: number;
  articles_parsed?: number;
  quality_status?: 'complete' | 'review' | 'incomplete';
  notes?: string;
}

// Search result with rank
export interface SearchResult<T> {
  item: T;
  rank?: number;
}

// Query parameters
export interface SearchParams {
  query: string;
  regulations?: string[];
  limit?: number;
}

export interface CompareParams {
  topic: string;
  regulations: string[];
}

export interface MapControlsParams {
  framework: 'ISO27001' | 'NIST_CSF';
  control?: string;
  regulation?: string;
}

export interface CheckApplicabilityParams {
  sector: string;
  subsector?: string;
  size?: 'sme' | 'large';
  member_state?: string;
}
