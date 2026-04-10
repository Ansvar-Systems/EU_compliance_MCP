// Ingest the Commission Guidelines on the Definition of an Artificial Intelligence System.
// Source: https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-definition-artificial-intelligence-system
import { ingestGuidanceDocument } from './ai-act-guidance-common.js';

const CONFIG = {
  id: 'AI_ACT_GL_DEFINITION',
  title: 'Commission Guidelines on the Definition of an Artificial Intelligence System',
  issuingBody: 'AI Office',
  reference: 'C(2025) 924 final',
  datePublished: '2025-02-06',
  pdfUrl:
    'https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-definition-artificial-intelligence-system',
  pageUrl:
    'https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-definition-artificial-intelligence-system',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    scope: 'Threshold question: what qualifies as an AI system under the Act',
    target_articles: ['3'],
  },
  minSections: 10,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
