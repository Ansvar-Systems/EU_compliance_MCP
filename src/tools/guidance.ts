import type { DatabaseAdapter } from '../database/types.js';
import { escapeFts5Query } from './fts-utils.js';
import { buildCitation } from '../utils/citation.js';

export interface SearchGuidanceInput {
  query: string;
  document_id?: string;
  issuing_body?: string;
  related_regulation?: string;
  limit?: number;
}

export interface SearchGuidanceResult {
  document_id: string;
  document_reference: string;
  section_number: string;
  section_title: string;
  snippet: string;
  related_regulation: string;
  issuing_body: string;
  date_published: string;
}

export interface GetGuidanceSectionInput {
  document_id: string;
  section_number: string;
}

export interface GuidanceSection {
  document_id: string;
  document_title: string;
  document_reference: string;
  issuing_body: string;
  related_regulation: string;
  date_published: string;
  date_revised: string | null;
  pdf_url: string | null;
  section_number: string;
  title: string;
  content: string;
  parent_section: string | null;
}

export interface ListGuidanceInput {
  issuing_body?: string;
  related_regulation?: string;
}

export interface GuidanceDocumentSummary {
  id: string;
  title: string;
  issuing_body: string;
  document_reference: string;
  related_regulation: string;
  date_published: string;
  date_revised: string | null;
  status: string;
  section_count: number;
}

export async function searchGuidance(
  db: DatabaseAdapter,
  input: SearchGuidanceInput,
): Promise<SearchGuidanceResult[]> {
  const { query, document_id, issuing_body, related_regulation } = input;
  const limit = input.limit ?? 15;

  const escapedQuery = escapeFts5Query(query);
  if (!escapedQuery) return [];

  const params: (string | number)[] = [escapedQuery];
  const conditions: string[] = [];

  if (document_id) {
    conditions.push('gs.document_id = ?');
    params.push(document_id);
  }
  if (issuing_body) {
    conditions.push('gd.issuing_body = ?');
    params.push(issuing_body);
  }
  if (related_regulation) {
    conditions.push("(gd.related_regulation = ? OR gd.related_regulation = 'both')");
    params.push(related_regulation);
  }

  const whereExtra =
    conditions.length > 0 ? ' AND ' + conditions.join(' AND ') : '';

  params.push(limit);

  const sql = `
    SELECT
      gs.document_id,
      gd.document_reference,
      gs.section_number,
      gs.title AS section_title,
      snippet(guidance_sections_fts, 3, '>>>', '<<<', '...', 32) AS snippet,
      gd.related_regulation,
      gd.issuing_body,
      gd.date_published
    FROM guidance_sections_fts
    JOIN guidance_sections gs ON gs.rowid = guidance_sections_fts.rowid
    JOIN guidance_documents gd ON gs.document_id = gd.id
    WHERE guidance_sections_fts MATCH ?${whereExtra}
    ORDER BY rank
    LIMIT ?
  `;

  const result = await db.query(sql, params);
  return result.rows as SearchGuidanceResult[];
}

export async function getGuidanceSection(
  db: DatabaseAdapter,
  input: GetGuidanceSectionInput,
): Promise<GuidanceSection | null> {
  const { document_id, section_number } = input;

  const sql = `
    SELECT
      gs.document_id,
      gd.title AS document_title,
      gd.document_reference,
      gd.issuing_body,
      gd.related_regulation,
      gd.date_published,
      gd.date_revised,
      gd.pdf_url,
      gs.section_number,
      gs.title,
      gs.content,
      gs.parent_section
    FROM guidance_sections gs
    JOIN guidance_documents gd ON gs.document_id = gd.id
    WHERE gs.document_id = ? AND gs.section_number = ?
  `;

  const result = await db.query(sql, [document_id, section_number]);
  if (result.rows.length === 0) return null;
  const section = result.rows[0] as GuidanceSection;
  return {
    ...section,
    _citation: buildCitation(
      `${section.document_reference} Section ${section.section_number}`,
      `${section.title} — ${section.document_reference}`,
      'get_guidance_section',
      { document_id, section_number },
      section.pdf_url,
    ),
  } as GuidanceSection & { _citation: ReturnType<typeof buildCitation> };
}

export async function listGuidance(
  db: DatabaseAdapter,
  input: ListGuidanceInput,
): Promise<GuidanceDocumentSummary[]> {
  const params: string[] = [];
  const conditions: string[] = [];

  if (input.issuing_body) {
    conditions.push('gd.issuing_body = ?');
    params.push(input.issuing_body);
  }
  if (input.related_regulation) {
    conditions.push("(gd.related_regulation = ? OR gd.related_regulation = 'both')");
    params.push(input.related_regulation);
  }

  const whereClause =
    conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT
      gd.id,
      gd.title,
      gd.issuing_body,
      gd.document_reference,
      gd.related_regulation,
      gd.date_published,
      gd.date_revised,
      gd.status,
      COUNT(gs.rowid) AS section_count
    FROM guidance_documents gd
    LEFT JOIN guidance_sections gs ON gs.document_id = gd.id
    ${whereClause}
    GROUP BY gd.id
    ORDER BY gd.date_published DESC
  `;

  const result = await db.query(sql, params);
  return result.rows as GuidanceDocumentSummary[];
}
