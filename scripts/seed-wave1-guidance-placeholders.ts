#!/usr/bin/env npx tsx
// Seed placeholder guidance documents for Wave-1 (CRA/NIS2/DORA) materials
// announced but not yet published. Rows from the Pending-publications section
// of reports/eu-guidance-wave1-source-inventory-2026-06.md (arch-docs).
// Each placeholder gets one status-note section so FTS and
// check_data_freshness().guidance.pending_publications surface it.
import { writeSeed, type GuidanceSeedDoc } from './eu-guidance-wave1-common.js';

interface PlaceholderRow {
  id: string;
  title: string;
  issuing_body: string;
  status: 'planned' | 'draft';
  date_published: string | null;
  related_regulation: 'CRA' | 'NIS2' | 'DORA';
  url: string;
  license: string;
  freshness_note: string;
  target_articles: string[];
}

// POPULATED FROM THE PHASE-0 REPORT — Pending-publications rows only.
const PLACEHOLDERS: PlaceholderRow[] = [
  {
    id: 'CRA_GL_DRAFT_GUIDANCE_COMMUNICATION',
    title: 'Draft Commission guidance on the Cyber Resilience Act',
    issuing_body: 'European Commission (DG CONNECT)',
    status: 'planned',
    date_published: '2026-03-03',
    related_regulation: 'CRA',
    url: 'https://digital-strategy.ec.europa.eu/en/news/commission-publishes-feedback-draft-guidance-assist-companies-applying-cyber-resilience-act',
    license: 'EU-Decision-2011-833',
    freshness_note:
      'A draft Communication interpreting CRA provisions, published for feedback ' +
      '2026-03-03, consultation closed 2026-03-31. Hosted on the "Have Your Say" ' +
      'feedback portal (https://ec.europa.eu/info/law/better-regulation/have-your-say/' +
      'initiatives/16959-Draft-Commission-guidance-on-the-Cyber-Resilience-Act_en, ' +
      'HTTP 200). No stable final PDF on an EU page yet; final version expected ' +
      'later. Ingest once the final Communication lands. The Ares reference ' +
      '(Ares(2026)2319816) comes from law-firm summaries, not a fetched EU page — ' +
      'treat as provisional.',
    target_articles: [],
  },
  {
    id: 'CRA_GL_ENISA_SRP_MANUALS',
    title: 'ENISA Single Reporting Platform (SRP) manuals and reporting instructions',
    issuing_body: 'ENISA',
    status: 'planned',
    date_published: null,
    related_regulation: 'CRA',
    url: 'https://www.enisa.europa.eu/topics/product-security-and-certification/single-reporting-platform-srp',
    license: 'ENISA-CC-BY-4',
    freshness_note:
      "ENISA's SRP supports mandatory Article 14 reporting from 2026-09-11. ENISA " +
      'announced SRP manuals/instructions "in the course of June 2026" per the CRA ' +
      'search results. The SRP topic landing page exists; no manual document URL ' +
      'confirmed at verification time. Revisit once ENISA publishes the manuals. ' +
      'License provisionally `ENISA-CC-BY-4` on the host whitelist ' +
      '(enisa.europa.eu); since this is status: planned with no fetchable PDF yet, ' +
      'license_evidence_url points at the ENISA website notice — the per-document ' +
      'inside-cover CC BY 4.0 notice MUST be confirmed at ingestion before the row ' +
      'flips to published (ENISA-agency PDFs carry it, but the website notice alone ' +
      'is acknowledgement-only).',
    target_articles: ['14'],
  },
];

function main() {
  if (PLACEHOLDERS.length === 0) {
    console.log('No pending publications in the Phase-0 report — nothing to seed.');
    return;
  }
  for (const row of PLACEHOLDERS) {
    const doc: GuidanceSeedDoc = {
      id: row.id,
      title: row.title,
      issuing_body: row.issuing_body,
      document_reference: null,
      date_published: row.date_published,
      related_regulation: row.related_regulation,
      url: row.url,
      pdf_url: null,
      status: row.status,
      metadata: {
        license: row.license,
        freshness_note: row.freshness_note,
        target_articles: row.target_articles,
      },
      sections: [
        {
          section_number: '0',
          title: 'Status note',
          content: row.freshness_note,
          parent_section: null,
        },
      ],
    };
    writeSeed(doc);
    console.log(`wrote placeholder ${row.id} (${row.status})`);
  }
}

main();
