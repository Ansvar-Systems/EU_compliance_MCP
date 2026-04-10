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
    'https://ai-act-service-desk.ec.europa.eu/sites/default/files/2025-08/commission_guidelines_on_the_definition_of_an_artificial_intelligence_system_established_by_regulation_eu_20241689_ai_actenglish_nf2skcqfrtjdfggjavcodopcwz4_112455.PDF',
  pageUrl:
    'https://digital-strategy.ec.europa.eu/en/library/commission-publishes-guidelines-ai-system-definition-facilitate-first-ai-acts-rules-application',
  relatedRegulation: 'AI_ACT',
  status: 'published',
  metadata: {
    scope: 'Threshold question: what qualifies as an AI system under the Act',
    target_articles: ['3'],
  },
  // Shorter document (~40 pages) — accept ~7 parsed numbered sections.
  minSections: 5,
};

ingestGuidanceDocument(CONFIG).catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
