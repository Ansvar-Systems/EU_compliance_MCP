/**
 * Shared PDF-fetch / text-parse / DB-insert helper for AI Act guidance
 * ingestion scripts. Each per-document script provides a GuidanceDocConfig
 * and calls ingestGuidanceDocument(config).
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');
const RATE_LIMIT_MS = 2000;

export interface GuidanceDocConfig {
  id: string;
  title: string;
  issuingBody: string;
  reference: string | null;
  datePublished: string; // ISO
  /**
   * Primary PDF URL. Stored in guidance_documents.pdf_url as provenance.
   * If pdfUrls is set, pdfUrl should be the first entry for display purposes.
   */
  pdfUrl: string;
  /**
   * Optional: multiple PDFs for multi-chapter documents (e.g. GPAI CoP has
   * separate PDFs per chapter). All URLs are fetched, text is concatenated,
   * then section parsing runs over the combined text. Section numbers from
   * each PDF may collide (each chapter has its own 1/1.1/1.2 scheme); a
   * per-chapter prefix is applied when `pdfUrls` has more than one entry.
   */
  pdfUrls?: Array<{ url: string; sectionPrefix?: string }>;
  pageUrl: string;
  relatedRegulation: string; // e.g. 'AI_ACT'
  status: string; // 'published', 'draft', etc.
  metadata?: Record<string, unknown>;
  /**
   * Minimum number of parsed sections before the script accepts the result.
   * Default behaviour: fewer than minSections causes the script to throw, so
   * the dataset does not ship with a single 100-page blob hiding behind one
   * FTS row. For documents whose formatting defeats the section parser but
   * that we still want to expose (e.g. GPAI CoP, which uses Commitment/Measure
   * headings rather than dotted numbers), set allowFullDocFallback:true so
   * the helper emits one section per PDF containing the full chapter text.
   */
  minSections: number;
  allowFullDocFallback?: boolean;
}

export interface ParsedSection {
  sectionNumber: string;
  title: string;
  content: string;
  parentSection: string | null;
}

export async function fetchPdf(url: string, retries = 3): Promise<Buffer> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Ansvar-MCP-Ingestion/1.0 (compliance research)' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      console.error(`  fetchPdf attempt ${i + 1}/${retries}: ${err}`);
      if (i === retries - 1) throw err;
      await sleep(RATE_LIMIT_MS * (i + 1));
    }
  }
  throw new Error('unreachable');
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const uint8 = new Uint8Array(pdfBuffer);
  const pdfDoc = await pdfjsLib.getDocument({ data: uint8 }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const content = await page.getTextContent();
    let lastY: number | null = null;
    const lineItems: string[] = [];
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (!item.str) continue;
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
        lineItems.push('\n');
      }
      lineItems.push(item.str);
      if (y !== undefined) lastY = y;
    }
    parts.push(lineItems.join(''));
  }
  return parts.join('\n');
}

/**
 * Parse numbered sections from plain PDF text. Multi-level dotted numbers
 * ('1.1', '3.2.1') are preferred; single numbers with period/paren
 * ('1.', '2)') are accepted as section boundaries when followed by a
 * capitalised title.
 */
export function parseSections(text: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  const lines = text.split('\n');
  let current: ParsedSection | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sectionMatch =
      trimmed.match(/^(\d+(?:\.\d+)+)\s+(.{3,})/) ||
      trimmed.match(/^(\d+)[\.\)]\s+([A-Z].{2,})/);
    if (sectionMatch) {
      if (current) {
        current.content = contentLines.join('\n').trim();
        if (current.content.length > 20) sections.push(current);
      }
      const sectionNumber = sectionMatch[1];
      const parts = sectionNumber.split('.');
      current = {
        sectionNumber,
        title: sectionMatch[2].trim().substring(0, 200),
        content: '',
        parentSection: parts.length > 1 ? parts.slice(0, -1).join('.') : null,
      };
      contentLines = [trimmed];
    } else if (current) {
      contentLines.push(trimmed);
    }
  }
  if (current) {
    current.content = contentLines.join('\n').trim();
    if (current.content.length > 20) sections.push(current);
  }
  return sections;
}

export async function ingestGuidanceDocument(config: GuidanceDocConfig): Promise<void> {
  console.log(`=== Ingesting ${config.id}: ${config.title} ===`);
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  // Ensure schema exists (idempotent).
  const schemaSql = readFileSync(
    join(__dirname, 'add-guidance-tables.sql'),
    'utf-8',
  );
  db.exec(schemaSql);

  let sections: ParsedSection[] = [];
  // Retain raw per-chapter (or whole-doc) text for fallback use.
  const rawChunks: Array<{ prefix: string; text: string }> = [];

  if (config.pdfUrls && config.pdfUrls.length > 0) {
    // Multi-chapter document: fetch each PDF, parse sections, apply prefix.
    for (const entry of config.pdfUrls) {
      console.log(`Fetching PDF: ${entry.url}${entry.sectionPrefix ? ` (prefix: ${entry.sectionPrefix})` : ''}`);
      const pdfBuffer = await fetchPdf(entry.url);
      console.log(`  ${(pdfBuffer.length / 1024).toFixed(0)} KB`);
      const text = await extractPdfText(pdfBuffer);
      console.log(`  Extracted ${text.length} chars of text`);
      rawChunks.push({ prefix: entry.sectionPrefix || 'chapter', text });
      const chapterSections = parseSections(text);
      console.log(`  Parsed ${chapterSections.length} sections`);
      for (const sec of chapterSections) {
        sections.push({
          ...sec,
          sectionNumber: entry.sectionPrefix
            ? `${entry.sectionPrefix}.${sec.sectionNumber}`
            : sec.sectionNumber,
          parentSection: entry.sectionPrefix
            ? (sec.parentSection
              ? `${entry.sectionPrefix}.${sec.parentSection}`
              : entry.sectionPrefix)
            : sec.parentSection,
        });
      }
      await sleep(RATE_LIMIT_MS);
    }
    console.log(`  Total: ${sections.length} sections across ${config.pdfUrls.length} PDFs`);
  } else {
    console.log(`Fetching PDF: ${config.pdfUrl}`);
    const pdfBuffer = await fetchPdf(config.pdfUrl);
    console.log(`  ${(pdfBuffer.length / 1024).toFixed(0)} KB`);

    const text = await extractPdfText(pdfBuffer);
    console.log(`  Extracted ${text.length} chars of text`);
    rawChunks.push({ prefix: 'full', text });

    sections = parseSections(text);
    console.log(`  Parsed ${sections.length} sections`);
  }

  if (sections.length < config.minSections) {
    if (config.allowFullDocFallback) {
      console.log(
        `  Section parser yielded ${sections.length} < ${config.minSections}; ` +
          `falling back to one section per chunk (allowFullDocFallback).`,
      );
      sections = rawChunks
        .filter((chunk) => chunk.text.trim().length > 100)
        .map((chunk) => ({
          sectionNumber: chunk.prefix,
          title: `${chunk.prefix} (full text)`,
          content: chunk.text.trim(),
          parentSection: null,
        }));
      console.log(`  Emitting ${sections.length} full-doc fallback sections.`);
    } else {
      db.close();
      throw new Error(
        `Parsed ${sections.length} sections for ${config.id}; expected at least ${config.minSections}. ` +
          `Section parser may need adjustment for this document's numbering scheme.`,
      );
    }
  }

  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO guidance_documents
    (id, title, issuing_body, document_reference, date_published, related_regulation, url, pdf_url, status, metadata)
    VALUES (@id, @title, @issuingBody, @reference, @datePublished, @relatedRegulation, @pageUrl, @pdfUrl, @status, @metadata)
  `);
  const insertSection = db.prepare(`
    INSERT OR REPLACE INTO guidance_sections
    (document_id, section_number, title, content, parent_section)
    VALUES (@documentId, @sectionNumber, @title, @content, @parentSection)
  `);

  const tx = db.transaction((cfg: GuidanceDocConfig, secs: ParsedSection[]) => {
    insertDoc.run({
      id: cfg.id,
      title: cfg.title,
      issuingBody: cfg.issuingBody,
      reference: cfg.reference,
      datePublished: cfg.datePublished,
      relatedRegulation: cfg.relatedRegulation,
      pageUrl: cfg.pageUrl,
      pdfUrl: cfg.pdfUrl,
      status: cfg.status,
      metadata: cfg.metadata ? JSON.stringify(cfg.metadata) : null,
    });
    for (const sec of secs) {
      insertSection.run({
        documentId: cfg.id,
        sectionNumber: sec.sectionNumber,
        title: sec.title,
        content: sec.content,
        parentSection: sec.parentSection,
      });
    }
  });
  tx(config, sections);

  const count = (db
    .prepare('SELECT COUNT(*) as cnt FROM guidance_sections WHERE document_id = ?')
    .get(config.id) as { cnt: number }).cnt;
  console.log(`  Stored ${count} sections for ${config.id}`);
  db.close();
}
