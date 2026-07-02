import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';
import type { CitationEnvelope, CitationManifest } from './citation.js';
import { createCitationResolver, type CitationResolver } from './instrument-citation.js';

const GUIDES_DIR = process.env.EU_COMPLIANCE_GUIDES_DIR || '/app/data/guides';

// Guide prose is Ansvar-authored analysis navigation (synthesized), NOT quoted
// EUR-Lex text. Each row says so via this marker; the row's _citation
// identifies the underlying EUR-Lex instrument the section navigates (built
// from the corpus content table), not the author of the prose. Mirrors
// compare_requirements' handling of computed fields: derived content rides on
// a row cited to the underlying instrument.
const GUIDE_PROVENANCE = 'ansvar-synthesis';

interface DelegatedAct {
  id: string;
  celex_id: string;
  title: string;
  article_count: number;
  parent_article: string;
  covers: string;
  // Whether the act's text is in the corpus and resolvable as a `search`
  // framework scope. Defaults to true. When false, the act is listed in the
  // reference-only row (NOT as a searchable delegated-act row), so the guide
  // never tells a caller to query an id that errors. Enforced by
  // tests/extensions/guide-delegated-acts-resolve.test.ts against source_registry.
  ingested?: boolean;
}
interface ProportionalityTier {
  name: string;
  applies_to: string;
  key_articles: string[];
  note: string;
}
interface Derogation {
  article: string;
  applies_to: string;
  description: string;
}
interface Pitfall {
  id: string;
  severity: string;
  article: string;
  description: string;
  detail_level: 'quick' | 'full';
}
interface CrossRegulation {
  regulation: string;
  relationship: string;
  key_provisions: string[];
  note: string;
}
interface KeyStructure {
  article: string;
  title: string;
  description: string;
  detail_level: 'quick' | 'full';
}
interface KeyRecital {
  number: number;
  clarifies: string;
  detail_level: 'quick' | 'full';
}
interface NationalExample {
  country: string;
  law: string;
  title?: string;
  article?: string;
  note: string;
}
interface TimelineEntry {
  event: string;
  date: string;
  note: string;
}
interface GuideData {
  schema_version: string;
  regulation_id: string;
  regulation_name: string;
  celex_id: string;
  effective_date: string;
  guide_updated: string;
  delegated_acts: DelegatedAct[];
  proportionality: {
    description: string;
    tiers: ProportionalityTier[];
    derogations: Derogation[];
  };
  pitfalls: Pitfall[];
  cross_regulation: CrossRegulation[];
  key_structures: KeyStructure[];
  key_recitals: KeyRecital[];
  national_implementation: {
    pattern: string;
    known_examples: NationalExample[];
  };
  evidence_hint: string;
  timeline?: TimelineEntry[];
  citation_format: string;
}

function formatReferenceOnlyActs(acts: DelegatedAct[]): string {
  const rows = acts
    .map((a) => `- **${a.id}** (${a.celex_id}) — ${a.covers}`)
    .join('\n');
  return `### Related secondary acts (reference only — text not yet in the corpus, not searchable)\n${rows}\n`;
}

function formatProportionality(prop: GuideData['proportionality']): string {
  const tiers = prop.tiers
    .map((t) => `- **${t.name}:** ${t.applies_to}${t.note ? ` — ${t.note}` : ''}`)
    .join('\n');
  let text = `### Proportionality Tiers\n${tiers}\n`;
  if (prop.derogations.length > 0) {
    const derogs = prop.derogations
      .map((d) => `- **Art. ${d.article}** (${d.applies_to}): ${d.description}`)
      .join('\n');
    text += `\n**Derogations:**\n${derogs}\n`;
  }
  return text;
}

function formatPitfalls(pitfalls: Pitfall[], detailLevel: 'quick' | 'full'): string {
  const filtered =
    detailLevel === 'quick' ? pitfalls.filter((p) => p.detail_level === 'quick') : pitfalls;
  if (filtered.length === 0) return '';
  const items = filtered
    .map((p, i) => `${i + 1}. **Art. ${p.article}** [${p.severity}]: ${p.description}`)
    .join('\n');
  return `### Top Pitfalls\n${items}\n`;
}

function formatCrossRegulation(cross: CrossRegulation[]): string {
  if (cross.length === 0) return '';
  const items = cross
    .map((c) => `- **${c.regulation}** (${c.relationship}): ${c.note}`)
    .join('\n');
  return `### Cross-Regulation\n${items}\n`;
}

function formatKeyStructures(structures: KeyStructure[]): string {
  if (structures.length === 0) return '';
  const items = structures
    .map((s) => `- **Art. ${s.article}** — ${s.title}: ${s.description}`)
    .join('\n');
  return `### Key Article Structures\n${items}\n`;
}

function formatKeyRecitals(recitals: KeyRecital[]): string {
  if (recitals.length === 0) return '';
  const rows = recitals.map((r) => `| ${r.number} | ${r.clarifies} |`).join('\n');
  return `### Key Recitals\n| Recital | Clarifies |\n|---|---|\n${rows}\n`;
}

function formatNationalImplementation(nat: GuideData['national_implementation']): string {
  let text = `### National Implementation\n${nat.pattern}\n`;
  if (nat.known_examples.length > 0) {
    const examples = nat.known_examples
      .map((e) => `- **${e.country}:** ${e.law}${e.article ? ` Art. ${e.article}` : ''} — ${e.note}`)
      .join('\n');
    text += `\n${examples}\n`;
  }
  return text;
}

function formatTimeline(entries?: TimelineEntry[]): string {
  if (!entries || entries.length === 0) return '';
  const rows = entries.map((e) => `| ${e.date} | ${e.event} | ${e.note} |`).join('\n');
  return `### Timeline\n| Date | Event | Note |\n|---|---|---|\n${rows}\n`;
}

// One guide section (or delegated act), on the standard envelope shape.
interface GuideRow {
  section: string;
  provenance: typeof GUIDE_PROVENANCE;
  _citation: CitationEnvelope;
  content_markdown?: string;
  [key: string]: unknown;
}

const handler: ToolHandler = async (args, ctx) => {
  const regulation = typeof args.regulation === 'string' ? args.regulation : undefined;
  const detail_level =
    typeof args.detail_level === 'string' && args.detail_level === 'full' ? 'full' : 'quick';

  if (!regulation) {
    return errorResult(
      'get_regulation_guide: regulation is required (e.g. "DORA", "GDPR", "AI_ACT").',
    );
  }

  const guidePath = join(GUIDES_DIR, `${regulation}.json`);
  if (!existsSync(guidePath)) {
    // Honest empty (conformance I1): an unknown guide is a true zero, named
    // explicitly — not an error, not a silent empty.
    return textResult({
      results: [],
      meta: {
        regulation,
        detail_level,
        partial: false,
        message:
          `No analysis guide available for ${regulation}. Use list_sources to discover available regulations, ` +
          'check_applicability for scope, and compare_requirements for cross-regulation analysis.',
      },
    });
  }

  try {
    const guide: GuideData = JSON.parse(readFileSync(guidePath, 'utf-8'));
    const resolver: CitationResolver = createCitationResolver(
      ctx.db,
      (ctx.manifest ?? {}) as CitationManifest,
    );

    // The parent instrument's citation anchors every synthesized section row.
    const parent = resolver.resolve(guide.regulation_id);
    const results: GuideRow[] = [];
    const omitted: string[] = [];

    // Delegated / implementing acts the corpus actually serves: one row per
    // act, cited to the ACT's own instrument (its :meta row in the corpus).
    // The #101 reconciliation's `ingested` flags gate which acts qualify.
    const searchableActs = guide.delegated_acts.filter((a) => a.ingested !== false);
    const referenceOnlyActs = guide.delegated_acts.filter((a) => a.ingested === false);
    for (const act of searchableActs) {
      const cite = resolver.resolve(act.id);
      if (!cite) {
        omitted.push(act.id);
        continue;
      }
      results.push({
        section: 'delegated_act',
        id: act.id,
        celex_id: act.celex_id,
        title: act.title,
        article_count: act.article_count,
        parent_article: act.parent_article,
        covers: act.covers,
        searchable: true,
        provenance: GUIDE_PROVENANCE,
        _citation: cite.citation,
      });
    }

    // Synthesized sections, each cited to the parent instrument. Reference-only
    // acts are one aggregate row: their celex ids are curated placeholders in
    // several guides ("pending", "various"), so no per-act URL can be built
    // without fabrication — the row cites the parent whose secondary-act
    // landscape it describes, and the acts stay listed in the content.
    const sections: Array<{ section: string; content: string; extra?: Record<string, unknown> }> =
      [];
    if (referenceOnlyActs.length > 0) {
      sections.push({
        section: 'related_secondary_acts',
        content: formatReferenceOnlyActs(referenceOnlyActs),
        extra: {
          acts: referenceOnlyActs.map((a) => ({
            id: a.id,
            celex_id: a.celex_id,
            covers: a.covers,
          })),
          searchable: false,
        },
      });
    }
    sections.push(
      { section: 'proportionality', content: formatProportionality(guide.proportionality) },
      { section: 'pitfalls', content: formatPitfalls(guide.pitfalls, detail_level) },
      { section: 'cross_regulation', content: formatCrossRegulation(guide.cross_regulation) },
    );
    if (detail_level === 'full') {
      sections.push(
        { section: 'key_structures', content: formatKeyStructures(guide.key_structures) },
        { section: 'key_recitals', content: formatKeyRecitals(guide.key_recitals) },
        { section: 'evidence', content: `### Evidence\n${guide.evidence_hint}\n` },
        {
          section: 'national_implementation',
          content: formatNationalImplementation(guide.national_implementation),
        },
        { section: 'timeline', content: formatTimeline(guide.timeline) },
        { section: 'citation_format', content: `### Citation Format\n${guide.citation_format}\n` },
      );
    }
    for (const s of sections) {
      if (!s.content) continue; // an empty section is omitted, not emitted blank
      if (!parent) {
        omitted.push(`${guide.regulation_id}/${s.section}`);
        continue;
      }
      results.push({
        section: s.section,
        content_markdown: s.content,
        ...(s.extra ?? {}),
        provenance: GUIDE_PROVENANCE,
        _citation: parent.citation,
      });
    }

    const messageParts: string[] = [];
    if (omitted.length > 0) {
      messageParts.push(
        `${omitted.length} guide row(s) omitted (incomplete source attribution): ${omitted.join(', ')}.`,
      );
    }
    if (results.length === 0) {
      messageParts.push(`The ${regulation} guide produced no citable sections.`);
    }

    return textResult({
      results,
      meta: {
        regulation: guide.regulation_id,
        regulation_name: guide.regulation_name,
        celex_id: guide.celex_id,
        effective_date: guide.effective_date,
        guide_updated: guide.guide_updated,
        detail_level,
        content_provenance:
          'Guide prose is Ansvar-authored analysis navigation (synthesized), not quoted EUR-Lex text; ' +
          "each row's _citation identifies the underlying EUR-Lex instrument, not the prose author.",
        partial: false,
        message: messageParts.join(' '),
      },
    });
  } catch (e) {
    return errorResult(
      `get_regulation_guide: error reading guide for ${regulation}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

export const getRegulationGuideTool: ExtensionTool = {
  definition: {
    name: 'get_regulation_guide',
    description:
      'Get an analysis guide for an EU regulation: delegated acts, proportionality tiers, top pitfalls, cross-regulation links, key structures, recitals, national implementation patterns, and timelines. Returns a {results, meta} envelope: one cited row per corpus-served delegated act (cited to the act\'s own EUR-Lex instrument) and per guide section (markdown content, cited to the parent instrument; prose is Ansvar-authored analysis, marked provenance=ansvar-synthesis). detail_level=quick (default) shows the essentials; full adds key structures, recitals, evidence hints, national examples, and citation format.',
    inputSchema: {
      type: 'object',
      properties: {
        regulation: {
          type: 'string',
          description: 'Regulation ID (e.g. "DORA", "GDPR", "AI_ACT", "NIS2").',
        },
        detail_level: {
          type: 'string',
          enum: ['quick', 'full'],
          description: 'quick (default) = essentials, full = exhaustive.',
        },
      },
      required: ['regulation'],
    },
  },
  handler,
};
