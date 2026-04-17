// Seed 3 placeholder guidance documents for AI Act materials that are not yet
// published. Each placeholder gets one guidance_sections row containing the
// freshness note so FTS search can surface it. Writes seed files consumed by
// build-db.ts.
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SEED_DIR = join(__dirname, '..', 'data', 'seed', 'guidance');

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
  mkdirSync(SEED_DIR, { recursive: true });

  for (const row of PLACEHOLDERS) {
    const metadata: Record<string, unknown> = {
      freshness_note: row.freshness_note,
      target_articles: row.target_articles,
    };
    if (row.draft_version !== undefined) metadata.draft_version = row.draft_version;

    const seed = {
      id: row.id,
      title: row.title,
      issuing_body: row.issuing_body,
      document_reference: null,
      date_published: row.date_published,
      related_regulation: row.related_regulation,
      url: row.url,
      pdf_url: null,
      status: row.status,
      metadata,
      sections: [
        {
          section_number: '0',
          title: 'Status note',
          content: row.freshness_note,
          parent_section: null,
        },
      ],
    };

    const path = join(SEED_DIR, `${row.id}.json`);
    writeFileSync(path, JSON.stringify(seed, null, 2) + '\n', 'utf-8');
  }

  console.log(`Seeded ${PLACEHOLDERS.length} placeholder documents to ${SEED_DIR}`);
}

main();
