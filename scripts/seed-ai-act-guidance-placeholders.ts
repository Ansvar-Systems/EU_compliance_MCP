// Seed 3 placeholder guidance documents for AI Act materials that are not yet
// published. Each placeholder gets one guidance_sections row containing the
// freshness note so FTS search can surface it.
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

interface Placeholder {
  id: string;
  title: string;
  issuing_body: string;
  status: 'planned' | 'draft';
  date_published: string | null;
  related_regulation: string;
  url: string;
  freshness_note: string;
  target_articles: string[];
  draft_version?: number;
}

const PLACEHOLDERS: Placeholder[] = [
  {
    id: 'AI_ACT_GL_HIGH_RISK',
    title: 'Commission Guidelines on High-Risk Classification (Article 6)',
    issuing_body: 'AI Office',
    status: 'planned',
    date_published: null,
    related_regulation: 'AI_ACT',
    url: 'https://digital-strategy.ec.europa.eu/en/news/supporting-implementation-ai-act-clear-guidelines',
    freshness_note:
      'Commission missed the February 2026 deadline. Draft expected Q2 2026. ' +
      'Critical for the August 2026 high-risk obligations deadline.',
    target_articles: ['6', 'Annex III'],
  },
  {
    id: 'AI_ACT_GL_TRANSPARENCY',
    title: 'Commission Guidelines on Transparent AI Systems (Article 50)',
    issuing_body: 'AI Office',
    status: 'planned',
    date_published: null,
    related_regulation: 'AI_ACT',
    url: 'https://digital-strategy.ec.europa.eu/en/news/supporting-implementation-ai-act-clear-guidelines',
    freshness_note: 'Under preparation. Targets Q2 2026.',
    target_articles: ['50'],
  },
  {
    id: 'AI_ACT_COP_MARKING',
    title: 'Code of Practice on AI Content Marking and Labelling',
    issuing_body: 'AI Office',
    status: 'draft',
    date_published: '2026-03-05',
    related_regulation: 'AI_ACT',
    url: 'https://digital-strategy.ec.europa.eu/en/library/commission-publishes-second-draft-code-practice-marking-and-labelling-ai-generated-content',
    freshness_note: 'Second public draft published 2026-03-05. Finalization expected H1 2026.',
    target_articles: ['50'],
    draft_version: 2,
  },
];

function main() {
  console.log('=== Seeding AI Act guidance placeholders ===');
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = ON');

  // Ensure schema exists.
  const schemaSql = readFileSync(join(__dirname, 'add-guidance-tables.sql'), 'utf-8');
  db.exec(schemaSql);

  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO guidance_documents
    (id, title, issuing_body, document_reference, date_published, related_regulation, url, pdf_url, status, metadata)
    VALUES (@id, @title, @issuing_body, NULL, @date_published, @related_regulation, @url, NULL, @status, @metadata)
  `);
  const insertSection = db.prepare(`
    INSERT OR REPLACE INTO guidance_sections
    (document_id, section_number, title, content, parent_section)
    VALUES (?, '0', 'Status note', ?, NULL)
  `);

  const tx = db.transaction((rows: Placeholder[]) => {
    for (const row of rows) {
      const metadata: Record<string, unknown> = {
        freshness_note: row.freshness_note,
        target_articles: row.target_articles,
      };
      if (row.draft_version !== undefined) metadata.draft_version = row.draft_version;

      insertDoc.run({
        id: row.id,
        title: row.title,
        issuing_body: row.issuing_body,
        date_published: row.date_published,
        related_regulation: row.related_regulation,
        url: row.url,
        status: row.status,
        metadata: JSON.stringify(metadata),
      });

      // One section row so FTS search can surface the placeholder.
      insertSection.run(row.id, row.freshness_note);
    }
  });
  tx(PLACEHOLDERS);

  const count = (db
    .prepare("SELECT COUNT(*) as cnt FROM guidance_documents WHERE id LIKE 'AI_ACT_%' AND status IN ('planned','draft')")
    .get() as { cnt: number }).cnt;
  console.log(`Seeded ${count} placeholder documents.`);
  db.close();
}

main();
