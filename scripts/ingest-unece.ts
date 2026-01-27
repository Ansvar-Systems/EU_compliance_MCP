#!/usr/bin/env npx tsx

/**
 * Ingest UN/ECE regulations from EUR-Lex.
 * UN regulations use numbered sections (1., 2., etc.) instead of "Article X".
 *
 * Usage: npx tsx scripts/ingest-unece.ts <celex_id> <output_file>
 * Example: npx tsx scripts/ingest-unece.ts 42021X0387 data/seed/un-r155.json
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

interface RegulationData {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  eur_lex_url: string;
  articles: Article[];
  definitions: Definition[];
}

const UN_REGULATION_METADATA: Record<string, { id: string; full_name: string; effective_date?: string }> = {
  '42021X0387': {
    id: 'UN_R155',
    full_name: 'UN Regulation No. 155 - Cyber security and cyber security management system',
    effective_date: '2021-01-22',
  },
  '42025X0005': {
    id: 'UN_R155',
    full_name: 'UN Regulation No. 155 - Cyber security and cyber security management system (Supplement 3)',
    effective_date: '2025-01-10',
  },
  '42021X0388': {
    id: 'UN_R156',
    full_name: 'UN Regulation No. 156 - Software update and software update management system',
    effective_date: '2021-01-22',
  },
};

// Section titles for UN regulations (most are shared, some differ)
const COMMON_SECTION_TITLES: Record<string, string> = {
  '1': 'Scope',
  '2': 'Definitions',
  '3': 'Application for approval',
  '4': 'Markings',
  '5': 'Approval',
  '7': 'Specifications',
  '8': 'Modification of vehicle type and extension of type approval',
  '9': 'Conformity of production',
  '10': 'Penalties for non-conformity of production',
  '11': 'Production definitively discontinued',
  '12': 'Names and addresses of Technical Services responsible for conducting approval tests, and of Type Approval Authorities',
};

// Regulation-specific section titles (for section 6 which differs)
const REGULATION_SECTION_TITLES: Record<string, Record<string, string>> = {
  UN_R155: {
    '6': 'Certificate of Compliance for Cybersecurity Management System',
  },
  UN_R156: {
    '6': 'Certificate of Compliance for Software Update Management System',
  },
};

function getSectionTitle(sectionNum: string, regulationId: string): string {
  const regSpecific = REGULATION_SECTION_TITLES[regulationId]?.[sectionNum];
  if (regSpecific) return regSpecific;
  return COMMON_SECTION_TITLES[sectionNum] || `Section ${sectionNum}`;
}

async function fetchEurLexHtml(celexId: string): Promise<string> {
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0; +https://github.com/Ansvar-Systems/EU_compliance_MCP)',
      Accept: 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseUnRegulation(html: string, celexId: string): { articles: Article[]; definitions: Definition[] } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const articles: Article[] = [];
  const definitions: Definition[] = [];

  // Strategy: Get all text elements (p, span, td) and process sequentially
  // UN regulations use numbered sections with content in tables/spans
  const allElements = Array.from(doc.querySelectorAll('p, span, td'));

  let currentSection: { number: string; title: string; lines: string[] } | null = null;
  let currentAnnex: { number: string; title: string; lines: string[] } | null = null;
  let inAnnex = false;
  let seenSections = new Set<string>();
  let inTableOfContents = true; // Skip TOC at start

  for (const el of allElements) {
    const text = el.textContent?.trim() || '';
    if (!text || text.length < 2) continue;

    // Detect end of table of contents - when we see the actual section header format
    const mainSectionHeader = text.match(/^(\d{1,2})\.\s+[A-Z][A-Z\s]+$/);
    if (mainSectionHeader && el.classList?.contains('oj-ti-grseq-1')) {
      inTableOfContents = false;
    }

    // Skip if still in table of contents
    if (inTableOfContents && !el.classList?.contains('oj-ti-grseq-1')) {
      continue;
    }

    // Check for main section headers (format: "8.   MODIFICATION OF VEHICLE TYPE...")
    // Note: some titles have hyphens (e.g., "NON-CONFORMITY")
    const sectionHeaderMatch = text.match(/^(\d{1,2})\.\s+([A-Z][A-Z\s,\-]+)$/);
    if (sectionHeaderMatch && el.classList?.contains('oj-ti-grseq-1')) {
      const sectionNum = sectionHeaderMatch[1];

      // Save current section if exists
      if (currentSection && currentSection.lines.length > 0 && !seenSections.has(currentSection.number)) {
        articles.push({
          number: currentSection.number,
          title: currentSection.title,
          text: currentSection.lines.join('\n\n'),
        });
        seenSections.add(currentSection.number);
      }

      currentSection = {
        number: sectionNum,
        title: R155_SECTION_TITLES[sectionNum] || sectionHeaderMatch[2].trim(),
        lines: [],
      };
      currentAnnex = null;
      inAnnex = false;
      continue;
    }

    // Check for Annex headers
    const annexMatch = text.match(/^Annex\s+(\d+)/i) || text.match(/^ANNEX\s+(\d+)/i);
    if (annexMatch || (el.classList?.contains('oj-doc-ti') && text.includes('Annex'))) {
      // Save current section/annex if exists
      if (currentSection && currentSection.lines.length > 0 && !seenSections.has(currentSection.number)) {
        articles.push({
          number: currentSection.number,
          title: currentSection.title,
          text: currentSection.lines.join('\n\n'),
        });
        seenSections.add(currentSection.number);
      }
      if (currentAnnex && currentAnnex.lines.length > 0 && !seenSections.has(`Annex ${currentAnnex.number}`)) {
        articles.push({
          number: `Annex ${currentAnnex.number}`,
          title: currentAnnex.title,
          text: currentAnnex.lines.join('\n\n'),
          chapter: 'Annexes',
        });
        seenSections.add(`Annex ${currentAnnex.number}`);
      }

      const annexNum = annexMatch?.[1] || text.match(/Annex\s+(\d+)/i)?.[1];
      if (annexNum) {
        inAnnex = true;
        currentAnnex = { number: annexNum, title: extractAnnexTitle(text), lines: [] };
        currentSection = null;
      }
      continue;
    }

    // Skip metadata and navigation elements
    if (
      text.includes('Official Journal') ||
      text.includes('EUR-Lex') ||
      text.includes('CONTENTS') ||
      text.match(/^[A-Z]+$/) ||
      text.match(/^L\s+\d+\/\d+$/) ||
      text.match(/^\d+\.\d+\.\d+\s+EN$/)
    ) {
      continue;
    }

    // Add content to current section or annex
    if (inAnnex && currentAnnex) {
      currentAnnex.lines.push(text);
    } else if (currentSection) {
      currentSection.lines.push(text);
    }
  }

  // Don't forget last section/annex
  if (currentSection && currentSection.lines.length > 0 && !seenSections.has(currentSection.number)) {
    articles.push({
      number: currentSection.number,
      title: currentSection.title,
      text: currentSection.lines.join('\n\n'),
    });
  }
  if (currentAnnex && currentAnnex.lines.length > 0 && !seenSections.has(`Annex ${currentAnnex.number}`)) {
    articles.push({
      number: `Annex ${currentAnnex.number}`,
      title: currentAnnex.title,
      text: currentAnnex.lines.join('\n\n'),
      chapter: 'Annexes',
    });
  }

  // Extract definitions from Section 2
  // UN regulations use format: 2.1. 'term' means/refers to definition
  // Note: Uses curly quotes (Unicode 8216/8217) not straight quotes
  const defsSection = articles.find((a) => a.number === '2');
  if (defsSection) {
    // Normalize text: collapse newlines, handle both straight and curly quotes
    const normalizedText = defsSection.text
      .replace(/\n+/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[\u2018\u2019]/g, "'"); // Convert curly quotes to straight

    // Match patterns like: 2.1. 'Vehicle type' means/refers to ...
    // Some definitions use "means", others use "refers to"
    const defRegex = /(\d+\.\d+\.)\s*'([^']+)'\s+(?:means|refers to)\s+(.+?)(?=\d+\.\d+\.\s*'|$)/g;
    const defMatches = normalizedText.matchAll(defRegex);
    for (const match of defMatches) {
      const term = match[2].trim().toLowerCase();
      let definition = match[3].trim();
      // Clean up the definition - remove trailing section numbers and punctuation
      definition = definition.replace(/\s*\d+\.\d+\.\s*$/, '').replace(/[;.]$/, '').trim();
      if (term && definition.length > 10) {
        definitions.push({
          term,
          definition,
          article: '2',
        });
      }
    }
  }

  // Deduplicate and sort articles
  const articleMap = new Map<string, Article>();
  for (const article of articles) {
    const existing = articleMap.get(article.number);
    if (!existing || article.text.length > existing.text.length) {
      articleMap.set(article.number, article);
    }
  }

  const sortedArticles = Array.from(articleMap.values()).sort((a, b) => {
    // Sort numbered sections first, then annexes
    const aIsAnnex = a.number.startsWith('Annex');
    const bIsAnnex = b.number.startsWith('Annex');
    if (aIsAnnex && !bIsAnnex) return 1;
    if (!aIsAnnex && bIsAnnex) return -1;
    if (aIsAnnex && bIsAnnex) {
      return parseInt(a.number.replace('Annex ', '')) - parseInt(b.number.replace('Annex ', ''));
    }
    return parseInt(a.number) - parseInt(b.number);
  });

  return { articles: sortedArticles, definitions };
}

function extractAnnexTitle(text: string): string {
  // Extract title after "Annex X"
  const match = text.match(/Annex\s+\d+\s*[–—-]?\s*(.*)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Common annex titles for R155
  const annexTitles: Record<string, string> = {
    '1': 'Information document',
    '2': 'Communication',
    '3': 'Arrangements of the approval mark',
    '4': 'Certificate of Compliance for CSMS',
    '5': 'List of threats and corresponding mitigations',
  };

  const annexNum = text.match(/Annex\s+(\d+)/i)?.[1];
  if (annexNum && annexTitles[annexNum]) {
    return annexTitles[annexNum];
  }

  return '';
}

async function ingestUnRegulation(celexId: string, outputPath: string): Promise<void> {
  const metadata = UN_REGULATION_METADATA[celexId];
  if (!metadata) {
    console.warn(`Unknown CELEX ID: ${celexId}. Using generic metadata.`);
  }

  const html = await fetchEurLexHtml(celexId);
  console.log(`Fetched ${html.length} bytes`);

  // Save HTML for debugging
  writeFileSync(outputPath.replace('.json', '.html'), html);

  const { articles, definitions } = parseUnRegulation(html, celexId);
  console.log(`Parsed ${articles.length} articles/sections, ${definitions.length} definitions`);

  if (articles.length === 0) {
    console.error('No sections found! The HTML structure may have changed.');
    return;
  }

  const regulation: RegulationData = {
    id: metadata?.id || celexId,
    full_name: metadata?.full_name || `UN Regulation ${celexId}`,
    celex_id: celexId,
    effective_date: metadata?.effective_date,
    eur_lex_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}`,
    articles,
    definitions,
  };

  writeFileSync(outputPath, JSON.stringify(regulation, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`Sections: ${articles.filter((a) => !a.number.startsWith('Annex')).length}`);
  console.log(`Annexes: ${articles.filter((a) => a.number.startsWith('Annex')).length}`);
  console.log(`Definitions: ${definitions.length}`);

  // Print summary
  console.log('\nSections found:');
  for (const article of articles) {
    const preview = article.text.substring(0, 60).replace(/\n/g, ' ');
    console.log(`  ${article.number}: ${article.title || '(no title)'} - ${preview}...`);
  }
}

// Main
const [, , celexId, outputPath] = process.argv;

if (!celexId || !outputPath) {
  console.log('Usage: npx tsx scripts/ingest-unece.ts <celex_id> <output_file>');
  console.log('Example: npx tsx scripts/ingest-unece.ts 42021X0387 data/seed/un-r155.json');
  console.log('\nKnown UN/ECE CELEX IDs:');
  Object.entries(UN_REGULATION_METADATA).forEach(([id, meta]) => {
    console.log(`  ${id} - ${meta.id} (${meta.full_name})`);
  });
  process.exit(1);
}

ingestUnRegulation(celexId, outputPath).catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
