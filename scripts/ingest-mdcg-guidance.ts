/**
 * Ingest MDCG (Medical Device Coordination Group) guidance documents
 * from the European Commission health website.
 *
 * Usage:
 *   npx tsx scripts/ingest-mdcg-guidance.ts
 *   npx tsx scripts/ingest-mdcg-guidance.ts --dry-run
 */

import * as cheerio from 'cheerio';
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_DIR = join(__dirname, '..', 'data', 'seed', 'guidance');
const RATE_LIMIT_MS = 2000;
const DRY_RUN = process.argv.includes('--dry-run');

const MDCG_INDEX_URL =
  'https://health.ec.europa.eu/medical-devices-sector/new-regulations/guidance-mdcg-endorsed-documents-and-other-guidance_en';

interface MdcgDocument {
  id: string;
  title: string;
  reference: string;
  datePublished: string;
  relatedRegulation: string;
  pdfUrl: string;
  pageUrl: string;
}

interface ParsedSection {
  id: string;
  sectionNumber: string;
  title: string;
  content: string;
  parentSection: string | null;
}

async function fetchWithRetry(
  url: string,
  retries = 3,
): Promise<Buffer> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Ansvar-MCP-Ingestion/1.0 (compliance research)',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error(`  Attempt ${i + 1}/${retries} failed: ${err}`);
      if (i === retries - 1) throw err;
      await sleep(RATE_LIMIT_MS * (i + 1));
    }
  }
  throw new Error('unreachable');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Parse a PDF text into numbered sections.
 * MDCG documents use numbered sections like "1.", "1.1", "3.2.1".
 */
function parseSections(text: string, docId: string): ParsedSection[] {
  const sections: ParsedSection[] = [];

  // Split by lines and look for section headers
  const lines = text.split('\n');
  let currentSection: ParsedSection | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Match section heading patterns:
    //   "1. Purpose"  "1.1 Scope"  "3.2.1 Risk Assessment"
    //   "1) Introduction"  "2) Scope"
    //   "2.2 Conformity assessment" (space-only, multi-level numbers)
    // Exclude footnote numbers: require period/paren OR multi-level number OR title starts uppercase
    const sectionMatch = trimmed.match(
      /^(\d+(?:\.\d+)+)\s+(.{3,})/, // Multi-level numbers like 2.2, 3.1.1 (always a section heading)
    ) || trimmed.match(
      /^(\d+)[\.\)]\s+([A-Z].{2,})/, // Single numbers with period/paren: "1. Purpose", "2) Scope"
    );

    if (sectionMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join('\n').trim();
        if (currentSection.content.length > 20) {
          sections.push(currentSection);
        }
      }

      const sectionNumber = sectionMatch[1];
      const parentParts = sectionNumber.split('.');
      const parentSection =
        parentParts.length > 1
          ? parentParts.slice(0, -1).join('.')
          : null;

      currentSection = {
        id: `${docId}_s${sectionNumber}`,
        sectionNumber,
        title: sectionMatch[2].trim().substring(0, 200),
        content: '',
        parentSection,
      };
      contentLines = [trimmed];
    } else if (currentSection) {
      contentLines.push(trimmed);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = contentLines.join('\n').trim();
    if (currentSection.content.length > 20) {
      sections.push(currentSection);
    }
  }

  return sections;
}

/**
 * Extract MDCG document links from the EC health website index page.
 */
function extractDocumentLinks($: cheerio.CheerioAPI): MdcgDocument[] {
  const documents: MdcgDocument[] = [];
  const seen = new Set<string>();

  // Look for PDF links in the page content
  $('a').each((_, el) => {
    const href = $(el).attr('href') || '';
    const text = $(el).text().trim();
    if (!text || !href) return;

    // Match MDCG reference pattern: "MDCG 2019-16" or "MDCG 2019-16 rev.1"
    const refMatch = text.match(
      /MDCG\s+(\d{4})-(\d+)(?:\s+rev\.?\s*(\d+))?/i,
    );
    if (!refMatch) return;

    // Only process PDF links or links that look like document references
    const isPdf = href.toLowerCase().includes('.pdf');
    const isDocLink =
      href.includes('health.ec.europa.eu') || href.includes('ec.europa.eu');
    if (!isPdf && !isDocLink) return;

    const id = `MDCG_${refMatch[1]}_${refMatch[2]}${refMatch[3] ? `_rev${refMatch[3]}` : ''}`;

    // Deduplicate by ID
    if (seen.has(id)) return;
    seen.add(id);

    const relatedRegulation = text.toLowerCase().includes('ivdr')
      ? 'IVDR'
      : text.toLowerCase().includes('mdr')
        ? 'MDR'
        : 'both';

    const fullUrl = href.startsWith('http')
      ? href
      : `https://health.ec.europa.eu${href}`;

    documents.push({
      id,
      title: text.substring(0, 500),
      reference: `MDCG ${refMatch[1]}-${refMatch[2]}${refMatch[3] ? ` rev.${refMatch[3]}` : ''}`,
      datePublished: `${refMatch[1]}-01-01`,
      relatedRegulation,
      pdfUrl: isPdf ? fullUrl : '',
      pageUrl: MDCG_INDEX_URL,
    });
  });

  return documents;
}

function writeMdcgSeed(
  doc: MdcgDocument,
  sections: ParsedSection[],
): void {
  mkdirSync(SEED_DIR, { recursive: true });

  const byNumber = new Map<string, ParsedSection>();
  for (const sec of sections) byNumber.set(sec.sectionNumber, sec);
  const deduped = Array.from(byNumber.values());

  const seed = {
    id: doc.id,
    title: doc.title,
    issuing_body: 'MDCG',
    document_reference: doc.reference,
    date_published: doc.datePublished,
    related_regulation: doc.relatedRegulation,
    url: doc.pageUrl,
    pdf_url: doc.pdfUrl,
    status: 'current',
    metadata: null,
    sections: deduped.map((sec) => ({
      section_number: sec.sectionNumber,
      title: sec.title,
      content: sec.content,
      parent_section: sec.parentSection,
    })),
  };

  const path = join(SEED_DIR, `${doc.id}.json`);
  writeFileSync(path, JSON.stringify(seed, null, 2) + '\n', 'utf-8');
}

async function main() {
  console.log('=== MDCG Guidance Document Ingestion ===');
  console.log(`Seed output: ${SEED_DIR}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log('');

  // Fetch index page
  console.log(`Fetching MDCG index page: ${MDCG_INDEX_URL}`);
  const indexHtml = await fetchWithRetry(MDCG_INDEX_URL);
  const $ = cheerio.load(indexHtml.toString());

  const documents = extractDocumentLinks($);
  console.log(`Found ${documents.length} MDCG documents\n`);

  if (documents.length === 0) {
    console.log(
      'WARNING: No documents found. The page structure may have changed.',
    );
    console.log(
      'Check the index URL and update the CSS selectors in extractDocumentLinks().',
    );
    return;
  }

  if (DRY_RUN) {
    console.log('DRY RUN — listing documents without downloading:');
    for (const doc of documents) {
      console.log(`  ${doc.reference}: ${doc.title.substring(0, 80)}`);
      console.log(`    PDF: ${doc.pdfUrl || 'no PDF link'}`);
      console.log(`    Regulation: ${doc.relatedRegulation}`);
    }
    return;
  }

  // Process documents with PDF links
  let totalSections = 0;
  let successCount = 0;
  let failCount = 0;

  // pdfjs-dist for PDF text extraction
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  for (const doc of documents) {
    if (!doc.pdfUrl) {
      console.log(`SKIP ${doc.reference}: no PDF link`);
      continue;
    }

    console.log(`Processing ${doc.reference}: ${doc.title.substring(0, 60)}...`);

    try {
      const pdfBuffer = await fetchWithRetry(doc.pdfUrl);
      // Extract text from PDF using pdfjs-dist
      // Preserve line breaks by detecting Y-coordinate changes between text items
      const uint8 = new Uint8Array(pdfBuffer);
      const pdfDoc = await pdfjsLib.getDocument({ data: uint8 }).promise;
      const numPages = pdfDoc.numPages;
      const textParts: string[] = [];

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        let lastY: number | null = null;
        const lineItems: string[] = [];

        for (const item of content.items as any[]) {
          if (!('str' in item) || !item.str) continue;
          const y = item.transform?.[5];
          if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
            lineItems.push('\n');
          }
          lineItems.push(item.str);
          if (y !== undefined) lastY = y;
        }
        textParts.push(lineItems.join(''));
      }

      const fullText = textParts.join('\n');

      // Parse sections
      let sections = parseSections(fullText, doc.id);

      // Fallback: if no numbered sections found, store the entire document
      // as a single section so the content is still FTS5-searchable
      if (sections.length === 0 && fullText.trim().length > 50) {
        sections = [
          {
            id: `${doc.id}_full`,
            sectionNumber: '0',
            title: doc.title || doc.reference,
            content: fullText.trim(),
            parentSection: null,
          },
        ];
      }

      writeMdcgSeed(doc, sections);

      totalSections += sections.length;
      successCount++;
      const fallback = sections.length === 1 && sections[0].sectionNumber === '0' ? ' [full-doc fallback]' : '';
      console.log(
        `  -> ${sections.length} sections (${numPages} pages, ${(pdfBuffer.length / 1024).toFixed(0)} KB)${fallback}`,
      );
    } catch (err) {
      failCount++;
      console.error(`  -> FAILED: ${err}`);
    }

    await sleep(RATE_LIMIT_MS);
  }

  // Summary
  console.log('\n=== Ingestion Complete ===');
  console.log(`Documents: ${successCount} succeeded, ${failCount} failed`);
  console.log(`Sections: ${totalSections} total`);
  console.log(`Seed files written to ${SEED_DIR}`);
  console.log('Run `npm run build:db` to rebuild the database from seed.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
