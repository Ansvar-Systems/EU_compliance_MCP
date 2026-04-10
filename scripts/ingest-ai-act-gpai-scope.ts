// Ingest the Commission Guidelines on GPAI Model Provider Obligations.
// Source: https://digital-strategy.ec.europa.eu/en/news/supporting-implementation-ai-act-clear-guidelines
import { ingestGuidanceDocument } from './ai-act-guidance-common.js';

const CONFIG = {
  id: 'AI_ACT_GL_GPAI_SCOPE',
  title: 'Commission Guidelines on GPAI Model Provider Obligations',
  issuingBody: 'AI Office',
  // Reference number to be confirmed from the published PDF; leave null until verified.
  reference: null,
  datePublished: '2025-07-19',
  pdfUrl:
    'https://digital-strategy.ec.europa.eu/en/news/supporting-implementation-ai-act-clear-guidelines',
  pageUrl:
    'https://digital-strategy.ec.europa.eu/en/news/supporting-implementation-ai-act-clear-guidelines',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    scope:
      'Scope of GPAI model definition, training compute threshold interpretation ' +
      '(>10^23 FLOP presumption), practical compliance for Art. 53 and Art. 55',
    target_articles: ['3', '51', '53', '55'],
  },
  minSections: 10,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
