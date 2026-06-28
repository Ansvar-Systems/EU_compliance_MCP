import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ExtensionTool, ToolHandler } from './types.js';
import { markdownResult } from './types.js';

const GUIDES_DIR = process.env.EU_COMPLIANCE_GUIDES_DIR || '/app/data/guides';

interface DelegatedAct {
  id: string;
  celex_id: string;
  title: string;
  article_count: number;
  parent_article: string;
  covers: string;
  // Whether the act's text is in the corpus and resolvable as a `search`
  // framework scope. Defaults to true. When false, the renderer lists the act
  // as reference-only (NOT under "search these as separate regulation IDs"),
  // so the guide never tells a caller to query an id that errors. Enforced by
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

function formatDelegatedActs(acts: DelegatedAct[]): string {
  if (acts.length === 0) return '';
  const searchable = acts.filter((a) => a.ingested !== false);
  const referenceOnly = acts.filter((a) => a.ingested === false);
  let out = '';
  if (searchable.length > 0) {
    const rows = searchable
      .map((a) => `| ${a.id} | ${a.celex_id} | ${a.covers} |`)
      .join('\n');
    out += `### Delegated Acts (search these as separate regulation IDs)\n| ID | CELEX | Covers |\n|---|---|---|\n${rows}\n`;
  }
  if (referenceOnly.length > 0) {
    const rows = referenceOnly
      .map((a) => `- **${a.id}** (${a.celex_id}) — ${a.covers}`)
      .join('\n');
    out += `${searchable.length > 0 ? '\n' : ''}### Related secondary acts (reference only — text not yet in the corpus, not searchable)\n${rows}\n`;
  }
  return out;
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

function formatQuickGuide(guide: GuideData): string {
  const header = `## Analysis Guide: ${guide.regulation_id} (${guide.regulation_name})\n\n**Effective:** ${guide.effective_date} | **CELEX:** ${guide.celex_id} | **Guide updated:** ${guide.guide_updated}\n`;
  return [
    header,
    formatDelegatedActs(guide.delegated_acts),
    formatProportionality(guide.proportionality),
    formatPitfalls(guide.pitfalls, 'quick'),
    formatCrossRegulation(guide.cross_regulation),
  ]
    .filter(Boolean)
    .join('\n');
}

function formatFullGuide(guide: GuideData): string {
  const header = `## Analysis Guide: ${guide.regulation_id} (${guide.regulation_name})\n\n**Effective:** ${guide.effective_date} | **CELEX:** ${guide.celex_id} | **Guide updated:** ${guide.guide_updated}\n`;
  return [
    header,
    formatDelegatedActs(guide.delegated_acts),
    formatProportionality(guide.proportionality),
    formatPitfalls(guide.pitfalls, 'full'),
    formatCrossRegulation(guide.cross_regulation),
    formatKeyStructures(guide.key_structures),
    formatKeyRecitals(guide.key_recitals),
    `### Evidence\n${guide.evidence_hint}\n`,
    formatNationalImplementation(guide.national_implementation),
    formatTimeline(guide.timeline),
    `### Citation Format\n${guide.citation_format}\n`,
  ]
    .filter(Boolean)
    .join('\n');
}

const handler: ToolHandler = async (args) => {
  const regulation = typeof args.regulation === 'string' ? args.regulation : undefined;
  const detail_level =
    typeof args.detail_level === 'string' && args.detail_level === 'full' ? 'full' : 'quick';

  if (!regulation) {
    return markdownResult(
      'get_regulation_guide: regulation is required (e.g. "DORA", "GDPR", "AI_ACT").',
    );
  }

  const guidePath = join(GUIDES_DIR, `${regulation}.json`);
  if (!existsSync(guidePath)) {
    return markdownResult(
      `No analysis guide available for ${regulation}. Use list_sources to discover available regulations, check_applicability for scope, and compare_requirements for cross-regulation analysis.`,
    );
  }

  try {
    const guide: GuideData = JSON.parse(readFileSync(guidePath, 'utf-8'));
    const text = detail_level === 'full' ? formatFullGuide(guide) : formatQuickGuide(guide);
    return markdownResult(text);
  } catch (e) {
    return markdownResult(
      `Error reading guide for ${regulation}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
};

export const getRegulationGuideTool: ExtensionTool = {
  definition: {
    name: 'get_regulation_guide',
    description:
      'Get an analysis guide for an EU regulation: delegated acts, proportionality tiers, top pitfalls, cross-regulation links, key structures, recitals, national implementation patterns, and timelines. detail_level=quick (default) shows the essentials; full adds key structures, recitals, evidence hints, national examples, and citation format.',
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
