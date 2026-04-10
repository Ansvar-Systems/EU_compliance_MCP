// Ingest the Commission Guidelines on Prohibited AI Practices (Art. 5).
// Source: https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-prohibited-artificial-intelligence-ai-practices-defined-ai-act
import { ingestGuidanceDocument } from './ai-act-guidance-common.js';

const CONFIG = {
  id: 'AI_ACT_GL_PROHIBITED',
  title: 'Commission Guidelines on Prohibited AI Practices',
  issuingBody: 'AI Office',
  reference: 'C(2025) 884 final',
  datePublished: '2025-02-04',
  pdfUrl: 'https://ec.europa.eu/newsroom/dae/redirection/document/112367',
  pageUrl:
    'https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-prohibited-artificial-intelligence-ai-practices-defined-ai-act',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    scope: 'Cumulative conditions breakdown for Art. 5 prohibited practices',
    target_articles: ['5'],
  },
  minSections: 10,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
