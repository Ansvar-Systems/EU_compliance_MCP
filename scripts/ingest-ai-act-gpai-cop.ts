// Ingest the General-Purpose AI Code of Practice, including the Model Documentation Form as sections.
// Source: https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai
import { ingestGuidanceDocument } from './ai-act-guidance-common.js';

// GPAI Code of Practice is published as three separate chapter PDFs plus a
// Model Documentation Form (DOCX — not ingested; documented in metadata).
// Each chapter has its own section numbering (1.1, 1.2, ... in Transparency),
// so we apply a chapter prefix when merging into one guidance_document.
const CONFIG = {
  id: 'AI_ACT_COP_GPAI',
  title: 'General-Purpose AI Code of Practice',
  issuingBody: 'AI Office',
  reference: 'GPAI Code of Practice v1.0',
  datePublished: '2025-07-10',
  // First URL used as primary provenance link in guidance_documents.pdf_url.
  pdfUrl: 'https://ec.europa.eu/newsroom/dae/redirection/document/118120',
  pdfUrls: [
    {
      url: 'https://ec.europa.eu/newsroom/dae/redirection/document/118120',
      sectionPrefix: 'transparency',
    },
    {
      url: 'https://ec.europa.eu/newsroom/dae/redirection/document/118115',
      sectionPrefix: 'copyright',
    },
    {
      url: 'https://ec.europa.eu/newsroom/dae/redirection/document/118119',
      sectionPrefix: 'safety',
    },
  ],
  pageUrl: 'https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    endorsed_date: '2025-08-01',
    chapters: ['Transparency', 'Copyright', 'Safety and Security'],
    model_documentation_form_url:
      'https://ec.europa.eu/newsroom/dae/redirection/document/118118',
    model_documentation_form_note:
      'Model Documentation Form is published as a DOCX alongside the CoP chapters; ' +
      'not ingested into guidance_sections because pdfjs-dist cannot parse DOCX. ' +
      'Referenced by Transparency Chapter Measure 1.2.',
    vademecum_url: 'https://ec.europa.eu/newsroom/dae/redirection/document/124170',
    scope:
      'Chapter 1 Transparency (Measures 1.1-1.3); ' +
      'Chapter 2 Copyright (Measures 2.1-2.5); ' +
      'Chapter 3 Safety and Security for systemic-risk models',
    target_articles: ['53', '55'],
  },
  minSections: 15,
  // GPAI CoP uses Commitment/Measure headings rather than dotted numeric
  // sections, so the generic parser misses most of the structure. Fall back
  // to one section per chapter containing the full text; FTS5 still indexes
  // it and users can retrieve chapter-level content via get_guidance_section.
  allowFullDocFallback: true,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
