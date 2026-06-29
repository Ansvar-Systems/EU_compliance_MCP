import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';
import {
  buildProvisionCitation,
  type CitationEnvelope,
  type CitationManifest,
} from './citation.js';

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

// A timeline obligation extracted from a provision's text, bound to the row
// (article) it was found in. Replaces the legacy flat per-regulation string,
// which concatenated every regulation's bodies and lost the article binding.
export interface Timeline {
  /** The matched phrase, verbatim ("72 hours", "without undue delay"). */
  text: string;
  /** Coarse classification for downstream filtering/sorting. */
  kind: 'hours' | 'days' | 'qualitative';
  /** Numeric magnitude for `hours`/`days`; omitted for qualitative phrases. */
  value?: number;
}

// Per-provision timeline extraction. Operates on ONE provision's body so each
// timeline is attributable to the article it came from (rows carry their own
// `timelines`). Deduplicates by phrase within the provision.
function extractTimelines(text: string): Timeline[] {
  const out: Timeline[] = [];
  const seen = new Set<string>();
  const push = (raw: string, kind: Timeline['kind'], value?: number) => {
    // Normalise internal whitespace (EUR-Lex text uses non-breaking spaces, so
    // "72 hours" and "72 hours" are the same obligation) before dedup.
    const phrase = raw.replace(/\s+/g, ' ').trim();
    const key = phrase.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(value === undefined ? { text: phrase, kind } : { text: phrase, kind, value });
  };
  // Trailing \b on every pattern: avoids partial-matching inside longer words
  // ("30 daystar" must not yield "30 days") and keeps all four patterns anchored
  // consistently.
  for (const m of text.matchAll(/(\d+)\s*hours?\b/gi)) push(m[0], 'hours', Number(m[1]));
  for (const m of text.matchAll(/(\d+)\s*days?\b/gi)) push(m[0], 'days', Number(m[1]));
  for (const m of text.matchAll(/without\s+undue\s+delay/gi)) push(m[0], 'qualitative');
  for (const m of text.matchAll(/\bimmediately\b/gi)) push(m[0], 'qualitative');
  return out;
}

interface ProvisionRow {
  canonical_ref: string;
  body: string;
  title: string | null;
  snippet?: string;
  bm25?: number;
  source_url: string | null;
  license_code: string | null;
  source_full_name: string | null;
  effective_date: string | null;
}

// One matched provision, on the standard envelope shape: a comparison is the
// set of rows grouped by `regulation` (the gateway / agent groups). Each row is
// fully cited and carries its own article-bound timelines.
interface ComparisonRow {
  regulation: string;
  canonical_ref: string;
  article: string;
  title: string | null;
  snippet: string;
  timelines: Timeline[];
  _citation: CitationEnvelope;
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

  // Publisher comes from the manifest (single-publisher corpus); per-row
  // license + source_url come from the joined content table.
  const manifest = (ctx.manifest ?? {}) as CitationManifest;

  const synonyms = getSynonyms(topic);
  const searchTerms = [topic, ...synonyms];

  // Build the FTS5 OR query across terms. canonical_ref is "REG:art_N", so
  // we filter provisions by the leading "REG:" prefix.
  const ftsQuery = searchTerms.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');

  const results: ComparisonRow[] = [];
  const coverage: Array<{ regulation: string; matched: number }> = [];
  const regulationsWithoutMatches: string[] = [];
  let citationIncomplete = 0;

  try {
    for (const regulation of regulations) {
      const refPrefix = `${regulation}:%`;
      const sql = `
        SELECT
          provisions.canonical_ref AS canonical_ref,
          provisions.body AS body,
          provisions.title AS title,
          snippet(content_fts, 0, '>>>', '<<<', '…', 24) AS snippet,
          bm25(content_fts) AS bm25,
          content.source_url AS source_url,
          content.license_code AS license_code,
          content.source_full_name AS source_full_name,
          content.effective_date AS effective_date
        FROM content_fts
        JOIN content ON content_fts.rowid = content.id
        JOIN provisions ON provisions.id = content.id
        WHERE content_fts MATCH ?
          AND provisions.canonical_ref LIKE ?
        ORDER BY bm25 ASC
        LIMIT 5
      `;
      const rows = ctx.db.prepare(sql).all(ftsQuery, refPrefix) as ProvisionRow[];

      let matched = 0;
      for (const row of rows) {
        // canonical_ref shape: "REG:art_N" → extract the "art_N" part
        const article = row.canonical_ref.split(':').slice(1).join(':');
        const snippet = (row.snippet ?? '').replace(/>>>/g, '').replace(/<<</g, '');
        const displayText = row.title
          ? `${regulation} ${article} — ${row.title}`
          : `${regulation} ${article}`;

        const cite = buildProvisionCitation(
          {
            canonical_ref: row.canonical_ref,
            display_text: displayText,
            source_url: row.source_url,
            license_code: row.license_code,
            source_full_name: row.source_full_name,
            effective_date: row.effective_date,
            // `article` is intentionally NOT passed: the reference-grade
            // search/get_provision _citation for eu-regulations omits it (the
            // content table has no article column), so the compare _citation
            // field-set matches them. The article is still on the row's
            // top-level `article` field and in canonical_ref/source_url.
          },
          manifest,
        );
        // No-fabrication: never emit a row whose citation triple is incomplete
        // (conformance I5). Skip it and surface the omission in meta.message.
        if (!cite.ok) {
          citationIncomplete += 1;
          continue;
        }

        results.push({
          regulation,
          canonical_ref: row.canonical_ref,
          article,
          title: row.title,
          snippet,
          timelines: extractTimelines(row.body),
          _citation: cite.citation,
        });
        matched += 1;
      }
      coverage.push({ regulation, matched });
      if (matched === 0) regulationsWithoutMatches.push(regulation);
    }

    // Honest signal (conformance I1/I2): an empty or partial-coverage
    // comparison must never read as a clean zero. `partial` stays false — a
    // regulation with no matching provisions is a true zero-match, not a
    // downstream-availability failure — and the gap is named explicitly.
    const messageParts: string[] = [];
    if (results.length === 0) {
      if (citationIncomplete > 0) {
        // Provisions matched but every one was dropped for an incomplete
        // citation triple — distinct from a genuine zero-match.
        messageParts.push(
          `All ${citationIncomplete} matched provision(s) were omitted (incomplete source attribution); no citable results.`,
        );
      } else {
        messageParts.push(
          `No provisions matched "${topic}" in ${regulations.join(', ')} after concept-synonym expansion. ` +
            'Try a broader topic or confirm the regulation ids.',
        );
      }
    } else {
      if (regulationsWithoutMatches.length > 0) {
        messageParts.push(`No provisions matched in: ${regulationsWithoutMatches.join(', ')}.`);
      }
      if (citationIncomplete > 0) {
        messageParts.push(
          `${citationIncomplete} matched provision(s) omitted (incomplete source attribution).`,
        );
      }
    }

    const meta = {
      topic,
      regulations_compared: regulations,
      expanded_terms: synonyms,
      coverage,
      regulations_without_matches: regulationsWithoutMatches,
      partial: false,
      message: messageParts.join(' '),
    };

    return textResult({ results, meta });
  } catch (e) {
    return errorResult(`compare_requirements: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const compareRequirementsTool: ExtensionTool = {
  definition: {
    name: 'compare_requirements',
    description:
      'Compare how 2+ EU regulations treat the same compliance topic. Uses concept-synonym expansion (incident reporting → breach notification, ICT risk → risk management, etc.) and FTS5 search over chassis content. Returns a {results, meta} envelope: one cited row per matched provision (article number + snippet + per-article structured timelines + a source_url/publisher/license _citation), with meta.coverage and an explicit note for any regulation with no matches.',
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
