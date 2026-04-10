// Ingest the General-Purpose AI Code of Practice, including the Model Documentation Form as sections.
// Source: https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai
import { ingestGuidanceDocument } from './ai-act-guidance-common.js';

const CONFIG = {
  id: 'AI_ACT_COP_GPAI',
  title: 'General-Purpose AI Code of Practice',
  issuingBody: 'AI Office',
  reference: 'GPAI Code of Practice v1.0',
  datePublished: '2025-07-10',
  pdfUrl: 'https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai',
  pageUrl: 'https://digital-strategy.ec.europa.eu/en/policies/contents-code-gpai',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    endorsed_date: '2025-08-01',
    chapters: ['Transparency', 'Copyright', 'Safety and Security'],
    includes_model_documentation_form: true,
    scope:
      'Chapter 1 Transparency (Measures 1.1-1.3) + Model Documentation Form; ' +
      'Chapter 2 Copyright (Measures 2.1-2.5); Chapter 3 Safety and Security for systemic-risk models',
    target_articles: ['53', '55'],
  },
  minSections: 15,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
