import type { Database } from 'better-sqlite3';
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
  db: Database,
  input: CompareInput
): Promise<CompareResult> {
  const { topic, regulations } = input;

  const comparisons: RegulationComparison[] = [];

  for (const regulation of regulations) {
    // Search for articles matching the topic in this regulation
    const results = await searchRegulations(db, {
      query: topic,
      regulations: [regulation],
      limit: 5,
    });

    // Get full article text for timeline extraction
    const articles: string[] = [];
    const requirements: string[] = [];
    let combinedText = '';

    for (const result of results) {
      articles.push(result.article);
      requirements.push(result.snippet.replace(/>>>/g, '').replace(/<<</g, ''));

      // Get full text for timeline extraction
      const fullArticle = db.prepare(`
        SELECT text FROM articles
        WHERE regulation = ? AND article_number = ?
      `).get(regulation, result.article) as { text: string } | undefined;

      if (fullArticle) {
        combinedText += ' ' + fullArticle.text;
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
