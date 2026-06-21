import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';

// Concept synonym families for cross-regulation terminology matching.
// Copied verbatim from legacy src/tools/compare.ts to preserve behavior.
const CONCEPT_SYNONYMS: Record<string, string[]> = {
  'incident reporting': [
    'breach notification', 'incident management', 'incident report',
    'significant incident', 'security incident',
  ],
  'breach notification': [
    'incident reporting', 'data breach', 'personal data breach',
    'incident notification', 'security breach',
  ],
  'data protection': [
    'privacy', 'personal data', 'data processing', 'data subject rights',
    'information protection',
  ],
  privacy: [
    'data protection', 'personal data', 'confidentiality', 'private life',
    'ePrivacy',
  ],
  'access control': [
    'authentication', 'identity verification', 'authorisation',
    'identity management', 'strong authentication',
  ],
  authentication: [
    'access control', 'identity verification', 'electronic identification',
    'multi-factor', 'strong user authentication',
  ],
  'risk management': [
    'risk assessment', 'risk analysis', 'risk evaluation', 'threat assessment',
    'ICT risk',
  ],
  'risk assessment': [
    'risk management', 'risk analysis', 'impact assessment', 'threat analysis',
    'vulnerability assessment',
  ],
  encryption: [
    'cryptography', 'cryptographic', 'cipher', 'pseudonymisation',
    'data at rest',
  ],
  cryptography: [
    'encryption', 'cryptographic controls', 'cipher', 'key management',
    'digital signature',
  ],
  'supply chain': [
    'third-party', 'third party', 'ICT services', 'outsourcing',
    'subcontracting', 'vendor',
  ],
  'third-party': [
    'supply chain', 'third party', 'ICT third-party', 'service provider',
    'outsourcing', 'subcontractor',
  ],
  'business continuity': [
    'disaster recovery', 'continuity plan', 'operational resilience',
    'recovery', 'backup',
  ],
  'disaster recovery': [
    'business continuity', 'continuity plan', 'restoration', 'backup',
    'recovery objective',
  ],
  'vulnerability management': [
    'vulnerability disclosure', 'vulnerability handling', 'security flaw',
    'patch management', 'security update',
  ],
  'vulnerability disclosure': [
    'vulnerability management', 'coordinated disclosure',
    'security vulnerability', 'responsible disclosure',
  ],
  audit: [
    'compliance', 'certification', 'conformity assessment', 'supervisory',
    'inspection', 'assurance',
  ],
  compliance: [
    'audit', 'certification', 'regulatory', 'supervisory authority',
    'conformity', 'enforcement',
  ],
  certification: [
    'audit', 'compliance', 'conformity assessment', 'accreditation',
    'qualified status', 'cybersecurity certification',
  ],
  transparency: [
    'reporting', 'disclosure', 'information provision', 'public reporting',
    'register',
  ],
  reporting: [
    'transparency', 'disclosure', 'notification', 'documentation',
    'reporting obligation',
  ],
  governance: [
    'accountability', 'management body', 'board responsibility', 'oversight',
    'organisational structure',
  ],
  accountability: [
    'governance', 'responsibility', 'management body', 'data controller',
    'duty of care',
  ],
  'penetration testing': [
    'security testing', 'TLPT', 'threat-led', 'red team', 'vulnerability testing',
  ],
  'security testing': [
    'penetration testing', 'resilience testing', 'TLPT',
    'vulnerability assessment', 'operational testing',
  ],
  consent: [
    'lawful basis', 'legal basis', 'legitimate interest',
    'data subject consent', 'explicit consent',
  ],
  'lawful basis': [
    'consent', 'legal basis', 'legitimate interest', 'contractual necessity',
    'legal obligation',
  ],
  'data portability': [
    'interoperability', 'data transfer', 'data migration', 'portability right',
    'data access',
  ],
  interoperability: [
    'data portability', 'compatibility', 'standardisation', 'cross-border',
    'mutual recognition',
  ],
  'record keeping': [
    'documentation', 'register', 'records of processing', 'logging',
    'traceability',
  ],
  documentation: [
    'record keeping', 'register', 'records', 'evidence', 'logging',
    'information register',
  ],
};

function getSynonyms(topic: string): string[] {
  const lowerTopic = topic.toLowerCase();
  const synonyms = new Set<string>();
  for (const [concept, terms] of Object.entries(CONCEPT_SYNONYMS)) {
    if (lowerTopic.includes(concept) || concept.includes(lowerTopic)) {
      for (const term of terms) synonyms.add(term);
    }
    for (const term of terms) {
      if (lowerTopic.includes(term) || term.includes(lowerTopic)) {
        synonyms.add(concept);
        for (const t of terms) synonyms.add(t);
      }
    }
  }
  synonyms.delete(lowerTopic);
  // No truncation: the transitive closure above reaches sibling concept families
  // (e.g. "incident reporting" → the "breach notification" family carrying GDPR's
  // controlled term "personal data breach"). A slice(0, 4) dropped those GDPR-native
  // terms by insertion order, so GDPR returned empty for incident-reporting topics.
  // The downstream FTS query is OR'd + bm25-ranked + LIMIT 5, which bounds output.
  return Array.from(synonyms);
}

function extractTimelines(text: string): string | undefined {
  const patterns: RegExp[] = [
    /(\d+)\s*hours?/gi,
    /(\d+)\s*days?/gi,
    /without\s+undue\s+delay/gi,
    /immediately/gi,
  ];
  const matches: string[] = [];
  for (const pattern of patterns) {
    const found = text.match(pattern);
    if (found) matches.push(...found);
  }
  return matches.length > 0 ? matches.join(', ') : undefined;
}

interface ProvisionRow {
  canonical_ref: string;
  body: string;
  snippet?: string;
  bm25?: number;
}

const handler: ToolHandler = async (args, ctx) => {
  const topic = typeof args.topic === 'string' ? args.topic : undefined;
  const regulations = Array.isArray(args.regulations)
    ? args.regulations.filter((r): r is string => typeof r === 'string')
    : undefined;

  if (!topic) {
    return errorResult(
      'compare_requirements: topic is required — pass a string describing what to compare (e.g. "incident reporting").',
    );
  }
  if (!regulations || regulations.length === 0) {
    return errorResult(
      'compare_requirements: regulations is required — pass a non-empty array of regulation ids (e.g. ["DORA", "NIS2"]).',
    );
  }

  const synonyms = getSynonyms(topic);
  const searchTerms = [topic, ...synonyms];

  // Build the FTS5 OR query across terms. canonical_ref is "REG:art_N", so
  // we filter provisions by the leading "REG:" prefix.
  const ftsQuery = searchTerms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');

  const comparisons: Array<{
    regulation: string;
    requirements: string[];
    articles: string[];
    timelines?: string;
  }> = [];

  try {
    for (const regulation of regulations) {
      const refPrefix = `${regulation}:%`;
      const sql = `
        SELECT
          provisions.canonical_ref AS canonical_ref,
          provisions.body AS body,
          snippet(content_fts, 0, '>>>', '<<<', '…', 24) AS snippet,
          bm25(content_fts) AS bm25
        FROM content_fts
        JOIN content ON content_fts.rowid = content.id
        JOIN provisions ON provisions.id = content.id
        WHERE content_fts MATCH ?
          AND provisions.canonical_ref LIKE ?
        ORDER BY bm25 ASC
        LIMIT 5
      `;
      const rows = ctx.db.prepare(sql).all(ftsQuery, refPrefix) as ProvisionRow[];

      const requirements: string[] = [];
      const articles: string[] = [];
      let combinedText = '';
      for (const row of rows) {
        // canonical_ref shape: "REG:art_N" → extract the "art_N" part
        const articlePart = row.canonical_ref.split(':').slice(1).join(':');
        articles.push(articlePart);
        requirements.push((row.snippet ?? '').replace(/>>>/g, '').replace(/<<</g, ''));
        combinedText += ' ' + row.body;
      }
      const timelines = extractTimelines(combinedText);
      comparisons.push({ regulation, requirements, articles, timelines });
    }

    return textResult({ topic, expanded_terms: synonyms, regulations: comparisons });
  } catch (e) {
    return errorResult(`compare_requirements: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const compareRequirementsTool: ExtensionTool = {
  definition: {
    name: 'compare_requirements',
    description:
      'Compare how 2+ EU regulations treat the same compliance topic. Uses concept-synonym expansion (incident reporting → breach notification, ICT risk → risk management, etc.) and FTS5 search over chassis content. Returns per-regulation snippets, article numbers, and extracted timelines.',
    inputSchema: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description:
            'What to compare (e.g. "incident reporting", "risk management", "encryption", "supply chain").',
        },
        regulations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Regulation IDs to compare (e.g. ["DORA", "NIS2", "GDPR"]).',
        },
      },
      required: ['topic', 'regulations'],
    },
  },
  handler,
};
