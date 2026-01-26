#!/usr/bin/env tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DATA INGESTION SCRIPT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fetches data from external sources and converts to seed JSON format.
 *
 * This script is the first step in the data pipeline:
 *
 *   Source (EUR-Lex, lagen.nu, etc.)
 *          │
 *          ▼
 *   ┌─────────────────┐
 *   │ ingest-source.ts │  ◄── YOU ARE HERE
 *   └─────────────────┘
 *          │
 *          ▼
 *   data/seed/source.json
 *          │
 *          ▼
 *   ┌─────────────────┐
 *   │   build-db.ts   │
 *   └─────────────────┘
 *          │
 *          ▼
 *   data/database.db
 *
 * ───────────────────────────────────────────────────────────────────────────
 * USAGE
 * ───────────────────────────────────────────────────────────────────────────
 *
 *   npm run ingest -- <identifier> <output-path>
 *
 *   Examples:
 *     npm run ingest -- 32016R0679 data/seed/gdpr.json
 *     npm run ingest -- "2018:218" data/seed/dataskyddslagen.json
 *
 * ───────────────────────────────────────────────────────────────────────────
 * CUSTOMIZATION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * This script is a TEMPLATE. You need to customize it for your data source:
 *
 *   1. Update SOURCE_BASE_URL and KNOWN_SOURCES for your source
 *   2. Implement extractItems() to parse your source's HTML/XML
 *   3. Implement extractDefinitions() if your source has definitions
 *   4. Adjust the output format if needed
 *
 * Different data sources require different parsing logic:
 *
 *   - EUR-Lex: Complex HTML with specific class names
 *   - lagen.nu: RDFa-enhanced HTML
 *   - lovdata.no: Different HTML structure
 *
 * ───────────────────────────────────────────────────────────────────────────
 * EXAMPLE: EUR-LEX INGESTION
 * ───────────────────────────────────────────────────────────────────────────
 *
 * The EU Regulations MCP uses this pattern for EUR-Lex:
 *
 *   1. Fetch HTML from https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:{celex_id}
 *   2. Parse with JSDOM
 *   3. Find articles by looking for <p> tags with class "sti-art"
 *   4. Extract article numbers from text (Article 1, Article 2, etc.)
 *   5. Extract definitions from Article 4 (or similar)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * @module scripts/ingest-source
 * @author Ansvar Systems AB
 * @license Apache-2.0
 */

import { JSDOM } from 'jsdom';
import * as fs from 'fs';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION - CUSTOMIZE THIS SECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Base URL for your data source
 *
 * Examples:
 *   - EUR-Lex: 'https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:'
 *   - lagen.nu: 'https://lagen.nu/'
 *   - lovdata.no: 'https://lovdata.no/dokument/NL/lov/'
 */
const SOURCE_BASE_URL = 'https://your-source.example.com/';

/**
 * Known source identifiers and their metadata
 *
 * Add entries for each source you want to ingest.
 * The identifier is what you pass on the command line.
 */
const KNOWN_SOURCES: Record<string, SourceMetadata> = {
  // Example: EU Regulation (CELEX ID)
  '32016R0679': {
    id: 'GDPR',
    full_name: 'General Data Protection Regulation',
    effective_date: '2018-05-25',
  },

  // Example: Swedish Law (SFS number)
  '2018:218': {
    id: 'DSL',
    full_name: 'Dataskyddslagen',
    effective_date: '2018-05-25',
  },

  // Add more sources here...
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Metadata for a known source
 */
interface SourceMetadata {
  /** Short identifier (e.g., "GDPR", "DSL") */
  id: string;

  /** Full official name */
  full_name: string;

  /** Effective date (ISO 8601) */
  effective_date?: string;
}

/**
 * Output seed file format
 *
 * This is what we produce for build-db.ts
 */
interface SeedOutput {
  id: string;
  full_name: string;
  identifier: string;
  effective_date?: string;
  source_url: string;
  items: ItemOutput[];
  definitions?: DefinitionOutput[];
}

/**
 * Item in the seed file
 */
interface ItemOutput {
  item_id: string;
  title?: string;
  text: string;
  parent?: string;
  metadata?: Record<string, unknown>;
  related?: Array<{
    type: string;
    source: string;
    item_id: string;
  }>;
}

/**
 * Definition in the seed file
 */
interface DefinitionOutput {
  term: string;
  definition: string;
  defining_item?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN INGESTION FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Main ingestion function
 *
 * @param identifier - Source identifier (e.g., CELEX ID, SFS number)
 * @param outputPath - Path to write the seed JSON file
 */
async function ingest(identifier: string, outputPath: string): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DATA INGESTION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   📋 Identifier: ${identifier}`);
  console.log(`   📄 Output:     ${outputPath}`);
  console.log('');

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1: Validate identifier
  // ─────────────────────────────────────────────────────────────────────────

  const metadata = KNOWN_SOURCES[identifier];

  if (!metadata) {
    console.error('❌ Unknown identifier:', identifier);
    console.error('');
    console.error('   Known identifiers:');
    for (const [id, meta] of Object.entries(KNOWN_SOURCES)) {
      console.error(`     - ${id} (${meta.id})`);
    }
    console.error('');
    console.error('   Add new sources to KNOWN_SOURCES in this script.');
    process.exit(1);
  }

  console.log(`   ✓ Found metadata for: ${metadata.id} (${metadata.full_name})`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2: Fetch source HTML
  // ─────────────────────────────────────────────────────────────────────────

  const url = buildSourceUrl(identifier);
  console.log('');
  console.log(`🌐 Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      // Some sources require specific headers
      'User-Agent': 'Ansvar-MCP-Ingestion/1.0',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const html = await response.text();
  console.log(`   ✓ Received ${formatSize(html.length)} of HTML`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3: Parse HTML
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  console.log('🔍 Parsing HTML...');

  const dom = new JSDOM(html);
  const document = dom.window.document;

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4: Extract items (articles, sections, etc.)
  // ─────────────────────────────────────────────────────────────────────────

  console.log('   📄 Extracting items...');
  const items = extractItems(document, metadata);
  console.log(`      └─ Found ${items.length} items`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 5: Extract definitions
  // ─────────────────────────────────────────────────────────────────────────

  console.log('   📖 Extracting definitions...');
  const definitions = extractDefinitions(document, metadata);
  console.log(`      └─ Found ${definitions.length} definitions`);

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 6: Build output
  // ─────────────────────────────────────────────────────────────────────────

  const output: SeedOutput = {
    id: metadata.id,
    full_name: metadata.full_name,
    identifier: identifier,
    effective_date: metadata.effective_date,
    source_url: url,
    items,
    definitions: definitions.length > 0 ? definitions : undefined,
  };

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 7: Write output file
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  console.log('💾 Writing output...');

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write with pretty formatting
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

  const fileSize = fs.statSync(outputPath).size;
  console.log(`   ✓ Wrote ${formatSize(fileSize)} to ${outputPath}`);

  // ─────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' INGESTION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`   📊 Source:      ${metadata.id}`);
  console.log(`   📄 Items:       ${items.length}`);
  console.log(`   📖 Definitions: ${definitions.length}`);
  console.log(`   💾 Output:      ${outputPath}`);
  console.log('');
  console.log('   Next step: npm run build:db');
  console.log('');
}

// ═══════════════════════════════════════════════════════════════════════════
// URL BUILDING - CUSTOMIZE FOR YOUR SOURCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build the URL to fetch a source
 *
 * Customize this for your data source.
 *
 * @param identifier - Source identifier
 * @returns Full URL to fetch
 */
function buildSourceUrl(identifier: string): string {
  // Example: EUR-Lex
  // return `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${identifier}`;

  // Example: lagen.nu
  // return `https://lagen.nu/${identifier.replace(':', '_')}`;

  // Generic fallback
  return `${SOURCE_BASE_URL}${encodeURIComponent(identifier)}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTION FUNCTIONS - CUSTOMIZE FOR YOUR SOURCE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract items (articles, sections) from the document
 *
 * ⚠️ THIS IS A PLACEHOLDER - You must implement this for your source!
 *
 * Different sources have different HTML structures. You'll need to:
 *
 *   1. Inspect the HTML of your source
 *   2. Find the elements containing items (articles, sections)
 *   3. Extract item_id, title, text, and parent
 *
 * @param document - Parsed DOM document
 * @param metadata - Source metadata
 * @returns Array of extracted items
 *
 * @example EUR-Lex pattern
 * ```typescript
 * // Articles are in <p class="sti-art">Article 1</p>
 * const articleHeaders = document.querySelectorAll('p.sti-art');
 *
 * for (const header of articleHeaders) {
 *   const match = header.textContent?.match(/Article (\d+)/);
 *   if (match) {
 *     const item_id = match[1];
 *     // Find following paragraphs until next article...
 *   }
 * }
 * ```
 *
 * @example lagen.nu pattern
 * ```typescript
 * // Sections are in <div class="paragraf">
 * const sections = document.querySelectorAll('div.paragraf');
 *
 * for (const section of sections) {
 *   const number = section.getAttribute('data-paragrafnummer');
 *   const text = section.querySelector('.paragraf-text')?.textContent;
 *   // ...
 * }
 * ```
 */
function extractItems(
  document: Document,
  _metadata: SourceMetadata
): ItemOutput[] {
  const items: ItemOutput[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // EXAMPLE: Generic paragraph-based extraction
  // This is just a placeholder - customize for your source!
  // ─────────────────────────────────────────────────────────────────────────

  // Find all paragraphs that look like items
  const paragraphs = document.querySelectorAll('p, div.item, div.article');

  let currentParent: string | undefined;
  let itemCounter = 0;

  for (const para of paragraphs) {
    const text = para.textContent?.trim() || '';

    // Skip empty paragraphs
    if (!text) continue;

    // Check if this is a chapter/section heading
    if (isParentHeading(para, text)) {
      currentParent = extractParentName(text);
      continue;
    }

    // Check if this is an item (article, section)
    if (isItem(para, text)) {
      const itemInfo = extractItemInfo(para, text);

      if (itemInfo) {
        items.push({
          item_id: itemInfo.item_id || String(++itemCounter),
          title: itemInfo.title,
          text: itemInfo.text,
          parent: currentParent,
        });
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Deduplicate items (some sources have duplicates)
  // ─────────────────────────────────────────────────────────────────────────

  const seen = new Set<string>();
  const unique: ItemOutput[] = [];

  for (const item of items) {
    if (!seen.has(item.item_id)) {
      seen.add(item.item_id);
      unique.push(item);
    } else {
      // If duplicate, keep the longer text version
      const existing = unique.find(i => i.item_id === item.item_id);
      if (existing && item.text.length > existing.text.length) {
        existing.text = item.text;
        existing.title = item.title || existing.title;
      }
    }
  }

  return unique;
}

/**
 * Extract definitions from the document
 *
 * ⚠️ THIS IS A PLACEHOLDER - You must implement this for your source!
 *
 * Definitions are often in a specific article (e.g., Article 4 in GDPR)
 * or in a dedicated definitions section.
 *
 * @param document - Parsed DOM document
 * @param metadata - Source metadata
 * @returns Array of extracted definitions
 */
function extractDefinitions(
  document: Document,
  _metadata: SourceMetadata
): DefinitionOutput[] {
  const definitions: DefinitionOutput[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  // EXAMPLE: Look for definition lists
  // This is just a placeholder - customize for your source!
  // ─────────────────────────────────────────────────────────────────────────

  // Pattern 1: <dl> definition lists
  const dlElements = document.querySelectorAll('dl');

  for (const dl of dlElements) {
    const dts = dl.querySelectorAll('dt');
    const dds = dl.querySelectorAll('dd');

    for (let i = 0; i < dts.length && i < dds.length; i++) {
      const term = dts[i].textContent?.trim();
      const definition = dds[i].textContent?.trim();

      if (term && definition) {
        definitions.push({
          term: cleanTerm(term),
          definition: cleanDefinition(definition),
        });
      }
    }
  }

  // Pattern 2: Numbered definitions like "(1) 'term' means..."
  const numberedPattern = /\((\d+)\)\s*['"']([^'"']+)['"']\s*means\s+([^;.]+)/gi;
  const bodyText = document.body?.textContent || '';
  let match;

  while ((match = numberedPattern.exec(bodyText)) !== null) {
    definitions.push({
      term: match[2].trim(),
      definition: match[3].trim(),
      defining_item: match[1],
    });
  }

  return definitions;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS - Customize these for your source
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if an element is a parent heading (chapter, part, etc.)
 */
function isParentHeading(element: Element, text: string): boolean {
  // Check by class name
  if (element.classList.contains('chapter') ||
      element.classList.contains('part') ||
      element.classList.contains('division')) {
    return true;
  }

  // Check by text pattern
  if (/^(CHAPTER|PART|DIVISION|TITLE)\s+[IVX0-9]+/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Extract parent name from heading text
 */
function extractParentName(text: string): string {
  // Remove any trailing description, keep just the identifier
  const match = text.match(/^(CHAPTER|PART|DIVISION|TITLE)\s+[IVX0-9]+/i);
  return match ? match[0] : text;
}

/**
 * Check if an element is an item (article, section)
 */
function isItem(element: Element, text: string): boolean {
  // Check by class name
  if (element.classList.contains('article') ||
      element.classList.contains('section') ||
      element.classList.contains('paragraf')) {
    return true;
  }

  // Check by text pattern
  if (/^Article\s+\d+/i.test(text) ||
      /^Section\s+\d+/i.test(text) ||
      /^\d+\s*§/i.test(text)) {
    return true;
  }

  return false;
}

/**
 * Extract item information from an element
 */
function extractItemInfo(
  element: Element,
  text: string
): { item_id: string; title?: string; text: string } | null {
  // Try to extract article number from text
  const articleMatch = text.match(/^Article\s+(\d+)/i);
  if (articleMatch) {
    // Find title (usually next line or in specific element)
    const titleElement = element.nextElementSibling;
    const title = titleElement?.classList.contains('title')
      ? titleElement.textContent?.trim()
      : undefined;

    // Get full text (may need to find following paragraphs)
    const fullText = extractFullText(element);

    return {
      item_id: articleMatch[1],
      title,
      text: fullText,
    };
  }

  // Try section pattern
  const sectionMatch = text.match(/^Section\s+(\d+)/i);
  if (sectionMatch) {
    return {
      item_id: sectionMatch[1],
      text: text,
    };
  }

  // Try Swedish paragraph pattern
  const paragrafMatch = text.match(/^(\d+)\s*§/);
  if (paragrafMatch) {
    return {
      item_id: paragrafMatch[1],
      text: text,
    };
  }

  return null;
}

/**
 * Extract full text of an item (may span multiple paragraphs)
 */
function extractFullText(startElement: Element): string {
  const parts: string[] = [];

  let current: Element | null = startElement;

  while (current) {
    const text = current.textContent?.trim();
    if (text) {
      parts.push(text);
    }

    // Move to next sibling
    current = current.nextElementSibling;

    // Stop if we hit another item or section
    if (current && isItem(current, current.textContent || '')) {
      break;
    }
    if (current && isParentHeading(current, current.textContent || '')) {
      break;
    }
  }

  return parts.join('\n\n');
}

/**
 * Clean up a definition term
 */
function cleanTerm(term: string): string {
  return term
    .replace(/^['"""']|['"""']$/g, '')  // Remove quotes
    .replace(/\s+/g, ' ')                // Normalize whitespace
    .trim()
    .toLowerCase();
}

/**
 * Clean up a definition
 */
function cleanDefinition(definition: string): string {
  return definition
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .trim();
}

/**
 * Format byte size for display
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' DATA INGESTION SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log(' Usage:');
  console.log('   npm run ingest -- <identifier> <output-path>');
  console.log('');
  console.log(' Examples:');
  console.log('   npm run ingest -- 32016R0679 data/seed/gdpr.json');
  console.log('   npm run ingest -- "2018:218" data/seed/dataskyddslagen.json');
  console.log('');
  console.log(' Known sources:');
  for (const [id, meta] of Object.entries(KNOWN_SOURCES)) {
    console.log(`   - ${id} → ${meta.id} (${meta.full_name})`);
  }
  console.log('');
  process.exit(1);
}

ingest(args[0], args[1]).catch(error => {
  console.error('');
  console.error('❌ Ingestion failed:', error.message);
  console.error('');
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
