import type { DatabaseAdapter } from '../database/types.js';
import { searchRegulations } from './search.js';

export interface CompareInput {
  topic: string;
  regulations: string[];
}

export interface RegulationComparison {
  regulation: string;
  requirements: string[];
  articles: string[];
  timelines?: string;
}

export interface CompareResult {
  topic: string;
  regulations: RegulationComparison[];
  key_differences?: string[];
}

/**
 * Concept synonym families for cross-regulation terminology matching.
 * Each key is a canonical concept; values are alternative terms used across
 * different EU regulations for the same underlying requirement.
 */
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  // Incident & breach reporting
  'incident reporting': ['breach notification', 'incident management', 'incident report', 'significant incident', 'security incident'],
  'breach notification': ['incident reporting', 'data breach', 'personal data breach', 'incident notification', 'security breach'],

  // Data protection & privacy
  'data protection': ['privacy', 'personal data', 'data processing', 'data subject rights', 'information protection'],
  'privacy': ['data protection', 'personal data', 'confidentiality', 'private life', 'ePrivacy'],

  // Access control & authentication
  'access control': ['authentication', 'identity verification', 'authorisation', 'identity management', 'strong authentication'],
  'authentication': ['access control', 'identity verification', 'electronic identification', 'multi-factor', 'strong user authentication'],

  // Risk management & assessment
  'risk management': ['risk assessment', 'risk analysis', 'risk evaluation', 'threat assessment', 'ICT risk'],
  'risk assessment': ['risk management', 'risk analysis', 'impact assessment', 'threat analysis', 'vulnerability assessment'],

  // Encryption & cryptography
  'encryption': ['cryptography', 'cryptographic', 'cipher', 'pseudonymisation', 'data at rest'],
  'cryptography': ['encryption', 'cryptographic controls', 'cipher', 'key management', 'digital signature'],

  // Supply chain & third-party
  'supply chain': ['third-party', 'third party', 'ICT services', 'outsourcing', 'subcontracting', 'vendor'],
  'third-party': ['supply chain', 'third party', 'ICT third-party', 'service provider', 'outsourcing', 'subcontractor'],

  // Business continuity & disaster recovery
  'business continuity': ['disaster recovery', 'continuity plan', 'operational resilience', 'recovery', 'backup'],
  'disaster recovery': ['business continuity', 'continuity plan', 'restoration', 'backup', 'recovery objective'],

  // Vulnerability management & disclosure
  'vulnerability management': ['vulnerability disclosure', 'vulnerability handling', 'security flaw', 'patch management', 'security update'],
  'vulnerability disclosure': ['vulnerability management', 'coordinated disclosure', 'security vulnerability', 'responsible disclosure'],

  // Audit & compliance & certification
  'audit': ['compliance', 'certification', 'conformity assessment', 'supervisory', 'inspection', 'assurance'],
  'compliance': ['audit', 'certification', 'regulatory', 'supervisory authority', 'conformity', 'enforcement'],
  'certification': ['audit', 'compliance', 'conformity assessment', 'accreditation', 'qualified status', 'cybersecurity certification'],

  // Transparency & reporting
  'transparency': ['reporting', 'disclosure', 'information provision', 'public reporting', 'register'],
  'reporting': ['transparency', 'disclosure', 'notification', 'documentation', 'reporting obligation'],

  // Governance & accountability
  'governance': ['accountability', 'management body', 'board responsibility', 'oversight', 'organisational structure'],
  'accountability': ['governance', 'responsibility', 'management body', 'data controller', 'duty of care'],

  // Penetration testing & security testing
  'penetration testing': ['security testing', 'TLPT', 'threat-led', 'red team', 'vulnerability testing'],
  'security testing': ['penetration testing', 'resilience testing', 'TLPT', 'vulnerability assessment', 'operational testing'],

  // Consent & lawful basis
  'consent': ['lawful basis', 'legal basis', 'legitimate interest', 'data subject consent', 'explicit consent'],
  'lawful basis': ['consent', 'legal basis', 'legitimate interest', 'contractual necessity', 'legal obligation'],

  // Data portability & interoperability
  'data portability': ['interoperability', 'data transfer', 'data migration', 'portability right', 'data access'],
  'interoperability': ['data portability', 'compatibility', 'standardisation', 'cross-border', 'mutual recognition'],

  // Record keeping & documentation
  'record keeping': ['documentation', 'register', 'records of processing', 'logging', 'traceability'],
  'documentation': ['record keeping', 'register', 'records', 'evidence', 'logging', 'information register'],
};

/**
 * Find synonym terms for a given topic query.
 * Returns the original topic plus up to 4 synonym terms.
 */
function getSynonyms(topic: string): string[] {
  const lowerTopic = topic.toLowerCase();
  const synonyms = new Set<string>();

  for (const [concept, terms] of Object.entries(CONCEPT_SYNONYMS)) {
    // Check if the topic matches or contains a concept key
    if (lowerTopic.includes(concept) || concept.includes(lowerTopic)) {
      for (const term of terms) {
        synonyms.add(term);
      }
    }
    // Check if the topic matches any synonym term
    for (const term of terms) {
      if (lowerTopic.includes(term) || term.includes(lowerTopic)) {
        synonyms.add(concept);
        for (const t of terms) {
          synonyms.add(t);
        }
      }
    }
  }

  // Remove the original topic itself and limit to 4 synonyms
  synonyms.delete(lowerTopic);
  return Array.from(synonyms).slice(0, 4);
}

/**
 * Extract timeline mentions from text (e.g., "24 hours", "72 hours")
 */
function extractTimelines(text: string): string | undefined {
  const timelinePatterns = [
    /(\d+)\s*hours?/gi,
    /(\d+)\s*days?/gi,
    /without\s+undue\s+delay/gi,
    /immediately/gi,
  ];

  const matches: string[] = [];
  for (const pattern of timelinePatterns) {
    const found = text.match(pattern);
    if (found) {
      matches.push(...found);
    }
  }

  return matches.length > 0 ? matches.join(', ') : undefined;
}

export async function compareRequirements(
  db: DatabaseAdapter,
  input: CompareInput
): Promise<CompareResult> {
  const { topic, regulations } = input;

  // Get synonym terms for expanded search
  const synonyms = getSynonyms(topic);
  const searchTerms = [topic, ...synonyms];

  const comparisons: RegulationComparison[] = [];

  for (const regulation of regulations) {
    // Search with original topic + synonym terms, then merge results
    const allResults: Map<string, { article: string; snippet: string; relevance: number }> = new Map();

    for (const term of searchTerms) {
      const results = await searchRegulations(db, {
        query: term,
        regulations: [regulation],
        limit: 5,
      });

      for (const result of results) {
        const existing = allResults.get(result.article);
        if (!existing || result.relevance > existing.relevance) {
          allResults.set(result.article, {
            article: result.article,
            snippet: result.snippet,
            relevance: result.relevance,
          });
        }
      }
    }

    // Sort by relevance and take top 5
    const mergedResults = Array.from(allResults.values())
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5);

    // Get full article text for timeline extraction
    const articles: string[] = [];
    const requirements: string[] = [];
    let combinedText = '';

    for (const result of mergedResults) {
      articles.push(result.article);
      requirements.push(result.snippet.replace(/>>>/g, '').replace(/<<</g, ''));

      // Get full text for timeline extraction
      const fullArticleResult = await db.query(
        `SELECT text FROM articles WHERE regulation = $1 AND article_number = $2`,
        [regulation, result.article]
      );

      if (fullArticleResult.rows.length > 0) {
        combinedText += ' ' + (fullArticleResult.rows[0] as { text: string }).text;
      }
    }

    const timelines = extractTimelines(combinedText);

    comparisons.push({
      regulation,
      requirements,
      articles,
      timelines,
    });
  }

  return {
    topic,
    regulations: comparisons,
  };
}
