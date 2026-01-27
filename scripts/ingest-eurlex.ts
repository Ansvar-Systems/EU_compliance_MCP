#!/usr/bin/env npx tsx

/**
 * Ingest EU regulations from EUR-Lex.
 *
 * Usage: npx tsx scripts/ingest-eurlex.ts <celex_id> <output_file>
 * Example: npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json
 */

import { writeFileSync } from 'fs';
import { JSDOM } from 'jsdom';

interface Article {
  number: string;
  title?: string;
  text: string;
  chapter?: string;
}

interface Definition {
  term: string;
  definition: string;
  article: string;
}

interface Recital {
  recital_number: number;
  text: string;
  related_articles?: string;
}

interface RegulationData {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  eur_lex_url: string;
  articles: Article[];
  definitions: Definition[];
  recitals?: Recital[];
}

const REGULATION_METADATA: Record<string, { id: string; full_name: string; effective_date?: string }> = {
  '32016R0679': { id: 'GDPR', full_name: 'General Data Protection Regulation', effective_date: '2018-05-25' },
  '32022L2555': { id: 'NIS2', full_name: 'Directive on measures for a high common level of cybersecurity across the Union', effective_date: '2024-10-17' },
  '32022R2554': { id: 'DORA', full_name: 'Digital Operational Resilience Act', effective_date: '2025-01-17' },
  '32024R1689': { id: 'AI_ACT', full_name: 'Artificial Intelligence Act', effective_date: '2024-08-01' },
  '32024R2847': { id: 'CRA', full_name: 'Cyber Resilience Act', effective_date: '2024-12-10' },
  '32019R0881': { id: 'CYBERSECURITY_ACT', full_name: 'EU Cybersecurity Act', effective_date: '2019-06-27' },
  '32024R1183': { id: 'EIDAS2', full_name: 'European Digital Identity Framework (eIDAS 2.0)', effective_date: '2024-05-20' },
  // Digital Single Market regulations
  '32023R2854': { id: 'DATA_ACT', full_name: 'Data Act', effective_date: '2025-09-12' },
  '32022R2065': { id: 'DSA', full_name: 'Digital Services Act', effective_date: '2024-02-17' },
  '32022R1925': { id: 'DMA', full_name: 'Digital Markets Act', effective_date: '2023-05-02' },
  // UN Regulations (adopted by EU)
  '42021X0387': { id: 'UN_R155', full_name: 'UN Regulation No. 155 - Cyber security and cyber security management system', effective_date: '2021-01-22' },
  '42025X0005': { id: 'UN_R155', full_name: 'UN Regulation No. 155 - Cyber security and cyber security management system (Supplement 3)', effective_date: '2025-01-10' },
};

async function fetchEurLexHtml(celexId: string): Promise<string> {
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0; +https://github.com/Ansvar-Systems/EU_compliance_MCP)',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseArticles(html: string, celexId: string): { articles: Article[]; definitions: Definition[] } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const articles: Article[] = [];
  const definitions: Definition[] = [];
  let currentChapter = '';

  // Get all text content and split by article markers
  const allText = doc.body?.textContent || '';
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

  let currentArticle: { number: string; title?: string; lines: string[] } | null = null;

  for (const line of lines) {
    const articleStart = line.match(/^Article\s+(\d+)$/i);
    if (articleStart) {
      if (currentArticle && currentArticle.lines.length > 0) {
        articles.push({
          number: currentArticle.number,
          title: currentArticle.title,
          text: currentArticle.lines.join('\n\n'),
          chapter: currentChapter || undefined,
        });
      }
      currentArticle = { number: articleStart[1], lines: [] };
      continue;
    }

    const chapterStart = line.match(/^CHAPTER\s+([IVXLC]+)/i);
    if (chapterStart) {
      currentChapter = chapterStart[1];
      continue;
    }

    if (currentArticle) {
      // Check if this is a title line (short, no period at end)
      if (!currentArticle.title && currentArticle.lines.length === 0 && line.length < 100 && !line.endsWith('.')) {
        currentArticle.title = line;
      } else if (line.length > 0) {
        currentArticle.lines.push(line);
      }
    }
  }

  // Don't forget the last article
  if (currentArticle && currentArticle.lines.length > 0) {
    articles.push({
      number: currentArticle.number,
      title: currentArticle.title,
      text: currentArticle.lines.join('\n\n'),
      chapter: currentChapter || undefined,
    });
  }

  // Deduplicate articles - keep the one with the most content for each number
  const articleMap = new Map<string, Article>();
  for (const article of articles) {
    const existing = articleMap.get(article.number);
    if (!existing || article.text.length > existing.text.length) {
      articleMap.set(article.number, article);
    }
  }
  const deduplicatedArticles = Array.from(articleMap.values())
    .sort((a, b) => parseInt(a.number) - parseInt(b.number));

  // Extract definitions from Article 4 (or similar definitions article)
  // Find definitions article from deduplicated list
  const defsArticle = deduplicatedArticles.find(a =>
    a.title?.toLowerCase().includes('definition')
  );

  if (defsArticle && defsArticle.text.includes('means')) {
    // Normalize text: collapse whitespace and normalize quotes
    const normalizedText = defsArticle.text
      .replace(/\s+/g, ' ')
      .replace(/[\u2018\u2019]/g, "'"); // Curly quotes to straight

    // Parse definitions by extracting content between consecutive numbered entries
    // This handles:
    // - Complex definitions with internal periods/semicolons
    // - 'term' or 'alternate' means... patterns (NIS2 Art 6)
    // - 'term1', 'term2' and 'term3' mean... patterns (CRA Art 3)
    // - 'term' of the something means... patterns (GDPR Art 4)
    // - mean, respectively... patterns (CRA Art 3)
    // - means: (a) ... patterns (complex definitions with sub-parts)
    const defRegex = /\((\d+)\)\s*'([^']+)'(?:[^(]*?)means?[,:;]?\s+(.+?)(?=\(\d+\)\s*'|$)/g;
    let defMatch;
    while ((defMatch = defRegex.exec(normalizedText)) !== null) {
      const term = defMatch[2].trim().toLowerCase();
      const definition = defMatch[3].trim();
      // Only add if we got meaningful content
      if (term.length > 0 && definition.length > 10) {
        definitions.push({
          term,
          definition,
          article: defsArticle.number,
        });
      }
    }
  }

  return { articles: deduplicatedArticles, definitions };
}

async function ingestRegulation(celexId: string, outputPath: string): Promise<void> {
  const metadata = REGULATION_METADATA[celexId];
  if (!metadata) {
    console.warn(`Unknown CELEX ID: ${celexId}. Using generic metadata.`);
  }

  const html = await fetchEurLexHtml(celexId);
  console.log(`Fetched ${html.length} bytes`);

  const { articles, definitions } = parseArticles(html, celexId);
  console.log(`Parsed ${articles.length} articles, ${definitions.length} definitions`);

  if (articles.length === 0) {
    console.error('No articles found! The HTML structure may have changed.');
    console.log('Saving raw HTML for debugging...');
    writeFileSync(outputPath.replace('.json', '.html'), html);
    return;
  }

  const regulation: RegulationData = {
    id: metadata?.id || celexId,
    full_name: metadata?.full_name || `Regulation ${celexId}`,
    celex_id: celexId,
    effective_date: metadata?.effective_date,
    eur_lex_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}`,
    articles,
    definitions,
  };

  writeFileSync(outputPath, JSON.stringify(regulation, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`Articles: ${articles.length}`);
  console.log(`Definitions: ${definitions.length}`);
}

// Main
const [,, celexId, outputPath] = process.argv;

if (!celexId || !outputPath) {
  console.log('Usage: npx tsx scripts/ingest-eurlex.ts <celex_id> <output_file>');
  console.log('Example: npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json');
  console.log('\nKnown CELEX IDs:');
  Object.entries(REGULATION_METADATA).forEach(([id, meta]) => {
    console.log(`  ${id} - ${meta.id} (${meta.full_name})`);
  });
  process.exit(1);
}

ingestRegulation(celexId, outputPath).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
