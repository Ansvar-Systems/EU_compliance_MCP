// Ingest the Template for Public Summary of Training Content for General-Purpose AI Models.
// Source: https://digital-strategy.ec.europa.eu/en/library/template-public-summary-training-content-general-purpose-ai-models
import { ingestGuidanceDocument } from './ai-act-guidance-common.js';

const CONFIG = {
  id: 'AI_ACT_TMPL_TRAINING_DATA',
  title: 'Template for the Public Summary of Training Content for General-Purpose AI Models',
  issuingBody: 'AI Office',
  reference: 'Training Data Summary Template v1.0',
  datePublished: '2025-07-24',
  pdfUrl:
    'https://digital-strategy.ec.europa.eu/en/library/template-public-summary-training-content-general-purpose-ai-models',
  pageUrl:
    'https://digital-strategy.ec.europa.eu/en/library/template-public-summary-training-content-general-purpose-ai-models',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    scope: 'Structured template implementing Art. 53(1)(d) training data summary obligation',
    target_articles: ['53'],
  },
  // Shorter document — accept more modest section counts.
  minSections: 5,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
