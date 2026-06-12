#!/usr/bin/env npx tsx
// Ingest Wave-1 EU guidance (CRA + NIS2 + DORA soft law) into seed JSONs.
// Sources: GREEN rows of reports/eu-guidance-wave1-source-inventory-2026-06.md
// (Ansvar-Architecture-Documentation). Every entry was live-verified on the
// date in that report. Usage:
//   npx tsx scripts/ingest-eu-guidance-wave1.ts [--dry-run] [--only <ID>]
import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  parseNumberedSections,
  writeSeed,
  type GuidanceSeedDoc,
  type ParsedSection,
} from './eu-guidance-wave1-common.js';

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1]
  : null;
const RATE_LIMIT_MS = 2000;

interface SourceRow {
  id: string;
  title: string;
  issuing_body: string;
  document_reference: string | null;
  date_published: string | null;
  related_regulation: 'CRA' | 'NIS2' | 'DORA';
  url: string;
  // Direct source-file URL. Normally a PDF; one NIS2 Cooperation Group row
  // serves a .docx (see NIS2_NISCG_SECURITY_MEASURES below + `source_kind`).
  source_url: string;
  // 'pdf' (default) or 'docx'. pdf_url in the seed is null for docx sources.
  source_kind: 'pdf' | 'docx';
  // Section-segmentation strategy. Default 'numbered' (parseNumberedSections
  // over PDF text). 'faq-questions' handles question-headed FAQ PDFs whose
  // headings carry no section numbers (NIS2_GL_FAQ). 'docx-styles' is implied
  // by source_kind:'docx'.
  segment?: 'numbered' | 'faq-questions';
  license: string;
  scope_note: string;
  // Carried into metadata when date_published is null (NISCG row).
  date_note?: string;
}

// POPULATED FROM THE PHASE-0 REPORT — GREEN published rows only (10 docs:
// 2 CRA, 6 NIS2, 2 DORA). id/title/issuing_body/document_reference/
// date_published/related_regulation/url/source/license copied 1:1 from the
// inventory; scope_note is a one-sentence summary of each row's notes.
const SOURCES: SourceRow[] = [
  // ---- CRA (2) ----
  {
    id: 'CRA_GL_FAQ_IMPLEMENTATION',
    title: 'Cyber Resilience Act implementation - Frequently asked questions',
    issuing_body: 'European Commission (DG CONNECT)',
    document_reference: null,
    date_published: '2025-12-03',
    related_regulation: 'CRA',
    url: 'https://digital-strategy.ec.europa.eu/en/library/cyber-resilience-act-implementation-frequently-asked-questions',
    source_url: 'https://ec.europa.eu/newsroom/dae/redirection/document/122331',
    source_kind: 'pdf',
    license: 'EU-Decision-2011-833',
    scope_note:
      'Commission FAQ on CRA implementation, covering scope, obligations and timelines for manufacturers, importers and distributors of products with digital elements.',
  },
  {
    id: 'CRA_GL_STANDARDS_MAPPING',
    title:
      'Cyber Resilience Act Requirements Standards Mapping - Joint Research Centre & ENISA Joint Analysis',
    issuing_body: 'ENISA and Joint Research Centre (JRC)',
    document_reference: null,
    date_published: '2024-04-04',
    related_regulation: 'CRA',
    url: 'https://www.enisa.europa.eu/publications/cyber-resilience-act-requirements-standards-mapping',
    source_url:
      'https://www.enisa.europa.eu/sites/default/files/2024-11/Cyber%20Resilience%20Act%20Requirements%20Standards%20Mapping%20-%20final_with_identifiers_0.pdf',
    source_kind: 'pdf',
    license: 'ENISA-CC-BY-4',
    scope_note:
      'JRC/ENISA joint analysis mapping CRA essential cybersecurity requirements to existing European and international standards (EUR 31892 EN, JRC137340).',
  },
  // ---- NIS2 (6) ----
  {
    id: 'NIS2_GL_ARTICLE4_GUIDELINES',
    title:
      'Commission Guidelines on the application of Article 4 (1) and (2) of Directive (EU) 2022/2555 (NIS 2 Directive)',
    issuing_body: 'European Commission (DG CONNECT)',
    document_reference: 'C(2023) 6068',
    date_published: '2023-09-14',
    related_regulation: 'NIS2',
    url: 'https://digital-strategy.ec.europa.eu/en/library/commission-guidelines-application-article-4-1-and-2-directive-eu-20222555-nis-2-directive',
    source_url: 'https://ec.europa.eu/newsroom/dae/redirection/document/98286',
    source_kind: 'pdf',
    license: 'EU-Decision-2011-833',
    scope_note:
      'Commission Communication giving the lex-specialis equivalence test for when sector-specific Union acts displace NIS2 obligations (concludes DORA is the only equivalent-in-effect act).',
  },
  {
    id: 'NIS2_GL_ARTICLE3_4_GUIDELINES',
    title:
      'Commission Guidelines on the application of Article 3(4) of Directive (EU) 2022/2555 (NIS 2 Directive)',
    issuing_body: 'European Commission (DG CONNECT)',
    document_reference: 'C(2023) 6070',
    date_published: '2023-09-14',
    related_regulation: 'NIS2',
    url: 'https://digital-strategy.ec.europa.eu/en/library/commission-guidelines-application-article-34-directive-eu-20222555-nis-2-directive',
    source_url: 'https://ec.europa.eu/newsroom/dae/redirection/document/98319',
    source_kind: 'pdf',
    license: 'EU-Decision-2011-833',
    scope_note:
      'Commission Communication on the registration of certain entity types under Article 3(4) in the NIS2 cooperation database.',
  },
  {
    id: 'NIS2_GL_FAQ',
    title:
      'Directive on measures for a high common level of cybersecurity across the Union (NIS2 Directive) - FAQs',
    issuing_body: 'European Commission (DG CONNECT)',
    document_reference: null,
    date_published: '2023-06-29',
    related_regulation: 'NIS2',
    url: 'https://digital-strategy.ec.europa.eu/en/faqs/directive-measures-high-common-level-cybersecurity-across-union-nis2-directive-faqs',
    source_url: 'https://digital-strategy.ec.europa.eu/en/node/10361/printable/pdf',
    source_kind: 'pdf',
    // Print-to-PDF FAQ: headings are questions ('Why did the Commission …?'),
    // not numbered sections — number-based parsing finds zero headings.
    segment: 'faq-questions',
    license: 'EU-Decision-2011-833',
    scope_note:
      'Commission FAQ on NIS2 scope, requirements and interaction with related EU acts (print-to-PDF render of the FAQ page).',
  },
  {
    id: 'NIS2_ENISA_TECH_IMPL_GUIDANCE',
    title: 'NIS2 Technical Implementation Guidance',
    issuing_body: 'ENISA',
    document_reference: null,
    date_published: '2025-06-26',
    related_regulation: 'NIS2',
    url: 'https://www.enisa.europa.eu/publications/nis2-technical-implementation-guidance',
    source_url:
      'https://www.enisa.europa.eu/sites/default/files/2025-06/ENISA_Technical_implementation_guidance_on_cybersecurity_risk_management_measures_version_1.0.pdf',
    source_kind: 'pdf',
    license: 'ENISA-CC-BY-4',
    scope_note:
      'ENISA v1.0 guidance translating Commission Implementing Regulation (EU) 2024/2690 into practical security measures and evidence examples across 13 thematic areas, with standards-mapping tables.',
  },
  {
    id: 'NIS2_ENISA_ROLES_SKILLS',
    title: 'Cybersecurity roles and skills for NIS2 Essential and Important Entities',
    issuing_body: 'ENISA',
    document_reference: null,
    date_published: '2025-06-26',
    related_regulation: 'NIS2',
    url: 'https://www.enisa.europa.eu/publications/cybersecurity-roles-and-skills-for-nis2-essential-and-important-entities',
    source_url:
      'https://www.enisa.europa.eu/sites/default/files/2025-06/Mapping%20NIS%202%20obligations%20with%20ECSF%20role%20profiles.pdf',
    source_kind: 'pdf',
    license: 'ENISA-CC-BY-4',
    scope_note:
      'ENISA mapping of NIS2 obligations to European Cybersecurity Skills Framework (ECSF) role profiles, identifying the roles and skills entities need to meet NIS2 measures.',
  },
  {
    id: 'NIS2_NISCG_SECURITY_MEASURES',
    title: 'Reference document on security measures for entities under NIS2',
    issuing_body: 'NIS Cooperation Group',
    document_reference: null,
    date_published: null,
    related_regulation: 'NIS2',
    url: 'https://digital-strategy.ec.europa.eu/en/policies/nis-cooperation-group',
    source_url: 'https://ec.europa.eu/newsroom/dae/redirection/document/129560',
    source_kind: 'docx',
    license: 'EU-Decision-2011-833',
    scope_note:
      'NIS Cooperation Group entity-facing reference document on the cybersecurity risk-management measures entities under NIS2 are expected to implement.',
    date_note:
      'date_published null: the NIS Cooperation Group policy hub is a document listing, not a per-document landing page, and carries no fetchable publication date for this item (not recorded from memory). Source served as .docx, not PDF.',
  },
  // ---- DORA (2) ----
  {
    id: 'DORA_JC_GL_COSTS_LOSSES',
    title:
      'Joint Guidelines on the estimation of aggregated annual costs and losses caused by major ICT-related incidents',
    issuing_body: 'ESAs Joint Committee (EBA, ESMA, EIOPA)',
    document_reference: 'JC 2024 34',
    date_published: '2025-03-18',
    related_regulation: 'DORA',
    url: 'https://www.esma.europa.eu/document/joint-guidelines-estimation-aggregated-annual-costs-and-losses-caused-major-ict-related',
    source_url:
      'https://www.esma.europa.eu/sites/default/files/2025-03/JC_2024_34_Guidelines_on_the_estimation_of_aggregated_annual_costs_and_losses_caused_by_major_ICT-related_incidents.pdf',
    source_kind: 'pdf',
    license: 'ESMA-Reuse-Notice',
    scope_note:
      'ESA Joint Guidelines under DORA Article 11(11) harmonising how financial entities (other than microenterprises) estimate aggregated annual gross costs and losses from major ICT-related incidents, with a common submission template.',
  },
  {
    id: 'DORA_JC_GL_OVERSIGHT_COOPERATION',
    title:
      'Joint Guidelines on the oversight cooperation and information exchange between the ESAs and the competent authorities',
    issuing_body: 'ESAs Joint Committee (EBA, ESMA, EIOPA)',
    document_reference: 'JC/GL/2024/36',
    date_published: '2024-11-06',
    related_regulation: 'DORA',
    url: 'https://www.esma.europa.eu/document/joint-guidelines-oversight-cooperation-and-information-exchange-between-esas-and-competent',
    source_url:
      'https://www.esma.europa.eu/sites/default/files/2024-11/JC-GL-2024-36_Guidelines_on_DORA_oversight_cooperation.pdf',
    source_kind: 'pdf',
    license: 'ESMA-Reuse-Notice',
    scope_note:
      'ESA Joint Guidelines establishing the framework for cooperation and information exchange between the ESAs and competent authorities in the oversight of critical ICT third-party service providers.',
  },
];

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Ansvar-MCP-Ingestion/1.0 (compliance research)' },
  });
  // Commission PDF redirects serve a malformed `Content-Type: /` header — do
  // NOT gate on content-type; gate on a successful parse downstream.
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function fetchPdfText(url: string): Promise<string> {
  const data = await fetchBytes(url);
  const pdf = await getDocument({ data }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // pdfjs returns text items in reading order but each item is a span; a
    // plain join(' ') flattens the whole page to one line and defeats the
    // line-based heading detection in parseNumberedSections. Reconstruct
    // line breaks from each item's Y coordinate (transform[5]) — a Y delta
    // > 2 units means a new visual line. (Same approach as
    // ai-act-guidance-common.ts:extractPdfText.)
    let lastY: number | null = null;
    const parts: string[] = [];
    for (const item of content.items as Array<{
      str?: string;
      transform?: number[];
    }>) {
      if (item.str === undefined) continue;
      const y = item.transform?.[5];
      if (lastY !== null && y !== undefined && Math.abs(y - lastY) > 2) {
        parts.push('\n');
      }
      parts.push(item.str);
      parts.push(' ');
      if (y !== undefined) lastY = y;
    }
    pages.push(parts.join(''));
  }
  return pages.join('\n');
}

interface DocxParagraph {
  style: string;
  text: string;
}

// Pull ordered {style,text} paragraphs from a .docx via python-docx. We need
// the paragraph STYLES, not just text: the one wave-1 docx (NISCG security
// measures) carries its numbering only in the table of contents — the body
// headings are unnumbered Word heading styles (Title / Heading 2 / Heading 3).
// parseNumberedSections would capture only the ToC (page-number titles, empty
// bodies); structuring from styles yields real sectioned content instead.
function readDocxParagraphs(file: string): DocxParagraph[] {
  const py = [
    'import sys, docx, json',
    'd = docx.Document(sys.argv[1])',
    'rows = []',
    'for p in d.paragraphs:',
    '    t = p.text.strip()',
    '    if t:',
    '        rows.append({"style": p.style.name, "text": t})',
    'print(json.dumps(rows))',
  ].join('\n');
  const out = execFileSync('python3', ['-c', py, file], {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out) as DocxParagraph[];
}

// Structure a heading-styled .docx into numbered sections. Title / Heading 2
// become top-level sections (1, 2, 3 …); Heading 3 becomes a subsection of the
// current top-level (e.g. 11.1). Table-of-contents paragraphs (toc* styles)
// are dropped. Normal paragraphs accumulate as the current heading's content.
function structureDocxByStyle(paras: DocxParagraph[]): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let l1 = 0;
  let l2 = 0;
  let current: ParsedSection | null = null;
  let buf: string[] = [];
  const flush = () => {
    if (current) {
      current.content = buf.join('\n').trim();
      sections.push(current);
    }
    buf = [];
  };
  for (const p of paras) {
    if (/^toc/i.test(p.style) || p.style === 'Intro+TOC H 1') continue; // drop ToC
    const isTop = p.style === 'Title' || p.style === 'Heading 2';
    const isSub = p.style === 'Heading 3';
    if (isTop) {
      flush();
      l1 += 1;
      l2 = 0;
      current = { sectionNumber: String(l1), title: p.text, content: '', parentSection: null };
    } else if (isSub && l1 > 0) {
      flush();
      l2 += 1;
      current = {
        sectionNumber: `${l1}.${l2}`,
        title: p.text,
        content: '',
        parentSection: String(l1),
      };
    } else if (current) {
      buf.push(p.text);
    }
  }
  flush();
  return sections;
}

async function fetchDocxSections(url: string, docId: string): Promise<ParsedSection[]> {
  const data = await fetchBytes(url);
  const dir = mkdtempSync(join(tmpdir(), 'eu-guidance-docx-'));
  const file = join(dir, 'document.docx');
  writeFileSync(file, Buffer.from(data));
  try {
    const paras = readDocxParagraphs(file);
    const sections = structureDocxByStyle(paras);
    if (sections.length === 0) {
      throw new Error(
        `${docId}: .docx produced zero sections from heading styles — refusing to emit an empty document (no silent fallbacks)`,
      );
    }
    return sections;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Segment a question-headed FAQ (no section numbers). Each line ending in '?'
// is a heading; the answer is the following text until the next question.
// pdfjs occasionally splits a long question across two visual lines — a '?'
// line that starts lowercase is a wrapped continuation, so pull the preceding
// content line(s) back into the heading until it starts with a capital.
function parseFaqQuestions(text: string, docId: string): ParsedSection[] {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let buf: string[] = [];
  let n = 0;
  const flush = () => {
    if (current) {
      current.content = buf.join(' ').replace(/\s+/g, ' ').trim();
      sections.push(current);
    }
    buf = [];
  };
  for (const line of lines) {
    if (line.endsWith('?')) {
      let title = line;
      // Merge wrapped heading fragments (lowercase start = continuation).
      while (/^[a-z]/.test(title) && buf.length > 0) {
        title = `${buf.pop()} ${title}`;
      }
      flush();
      n += 1;
      current = {
        sectionNumber: String(n),
        title: title.replace(/\s+/g, ' ').trim(),
        content: '',
        parentSection: null,
      };
    } else if (current) {
      buf.push(line);
    }
  }
  flush();
  if (sections.length === 0) {
    throw new Error(
      `${docId}: FAQ segmentation produced zero question headings — refusing to emit an empty document (no silent fallbacks)`,
    );
  }
  return sections;
}

async function fetchSections(src: SourceRow): Promise<ParsedSection[]> {
  if (src.source_kind === 'docx') {
    return fetchDocxSections(src.source_url, src.id);
  }
  const text = await fetchPdfText(src.source_url);
  if (src.segment === 'faq-questions') {
    return parseFaqQuestions(text, src.id);
  }
  return parseNumberedSections(text, src.id);
}

async function main() {
  if (SOURCES.length === 0) {
    throw new Error(
      'SOURCES is empty — populate it from the Phase-0 inventory report before running',
    );
  }
  const rows = ONLY ? SOURCES.filter((s) => s.id === ONLY) : SOURCES;
  if (ONLY && rows.length === 0) throw new Error(`--only ${ONLY}: no such source`);

  for (const src of rows) {
    console.log(`Ingesting ${src.id} (${src.related_regulation}) …`);
    const parsed = await fetchSections(src);

    const metadata: Record<string, unknown> = {
      license: src.license,
      scope: src.scope_note,
      source_url: src.source_url,
      source_kind: src.source_kind,
    };
    if (src.date_note) metadata.date_note = src.date_note;

    const doc: GuidanceSeedDoc = {
      id: src.id,
      title: src.title,
      issuing_body: src.issuing_body,
      document_reference: src.document_reference,
      date_published: src.date_published,
      related_regulation: src.related_regulation,
      url: src.url,
      pdf_url: src.source_kind === 'pdf' ? src.source_url : null,
      status: 'published',
      metadata: metadata as Record<string, unknown> & { license: string },
      sections: parsed.map((s) => ({
        section_number: s.sectionNumber,
        title: s.title,
        content: s.content,
        parent_section: s.parentSection,
      })),
    };

    // Surface duplicate section_numbers — footnote lines can false-match the
    // heading regex. parseNumberedSections is hardened against the common
    // single-level case, but report any residual dups loudly.
    const counts = new Map<string, number>();
    for (const s of doc.sections) counts.set(s.section_number, (counts.get(s.section_number) ?? 0) + 1);
    const dups = [...counts.entries()].filter(([, c]) => c > 1).map(([n]) => n);
    if (dups.length > 0) {
      console.warn(`  WARNING ${src.id}: duplicate section_numbers: ${dups.join(', ')}`);
    }

    if (DRY_RUN) {
      console.log(
        `  [dry-run] ${doc.sections.length} sections, first: ${doc.sections[0].title}`,
      );
    } else {
      writeSeed(doc);
      console.log(`  wrote data/seed/guidance/${src.id}.json (${doc.sections.length} sections)`);
    }
    await new Promise((r) => setTimeout(r, RATE_LIMIT_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
