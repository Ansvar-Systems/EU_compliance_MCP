// scripts/eu-guidance-wave1-common.ts
// Shared parsing + seed-writing helpers for the Wave-1 EU guidance ingester
// (CRA + NIS2 + DORA soft law). Modeled on scripts/ingest-mdcg-guidance.ts.
import { mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
export const SEED_DIR = join(dirname(__filename), '..', 'data', 'seed', 'guidance');

export interface ParsedSection {
  sectionNumber: string;
  title: string;
  content: string;
  parentSection: string | null;
}

// Heading detection, hardened against footnote/date false matches:
//   - Multi-level dotted numbers ('1.1', '3.2.1') are always treated as a
//     section heading when followed by a title (>=2 chars).
//   - Single-level numbers ('1', '7') require a period or paren ('1.', '2)')
//     AND a title that starts with an uppercase letter — this rejects
//     footnote lines like "1 See Regulation ..." and date fragments such as
//     "03/12/2025 New".
// Mirrors the proven hardening in ingest-mdcg-guidance.ts:parseSections.
const HEADING_MULTI_RE = /^(\d+(?:\.\d+)+)\s+(\S.{1,150})$/;
const HEADING_SINGLE_RE = /^(\d+)[.)]\s+([A-Z].{1,150})$/;

export function parseNumberedSections(text: string, docId: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let buf: string[] = [];

  // Sequence-tracking state, updated ONLY on accepted headings (a rejected
  // candidate must not pollute the established numbering flow, or the next
  // out-of-sequence candidate would be measured against the junk).
  let maxTopLevel = 0; // highest top-level component accepted so far
  let sawMultiLevel = false; // any 'a.b…' (deeper) heading accepted yet?
  // Single-level top-level numbers actually opened as headings (e.g. a real
  // '1.'/'2.'). A late single-level candidate is only legitimate if its own
  // top-level was opened, OR no deeper section has been seen yet.
  const openedTopLevels = new Set<number>();

  const flush = () => {
    if (current) {
      current.content = buf.join('\n').trim();
      sections.push(current);
    }
    buf = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(HEADING_MULTI_RE) || line.match(HEADING_SINGLE_RE);
    if (m) {
      const num = m[1];
      // Guard against '<n>.0' false matches: real section numbering starts at
      // '.1' (e.g. 4.1, 4.2), never '.0'. Lines like 'CC BY 4.0 licence' and
      // version stamps '1.0 03/12/2025' otherwise leak in as headings.
      if (/\.0$/.test(num)) {
        if (current) buf.push(line);
        continue;
      }
      const components = num.split('.').map((c) => Number(c));
      const topLevel = components[0];
      const isMultiLevel = components.length > 1;

      // (1) Year guard: a single-level 4-digit number ('2026') is a year
      // artifact from wrapped prose ('…by 30 October\n2026.'), never a heading.
      if (!isMultiLevel && /^\d{4}$/.test(num)) {
        if (current) buf.push(line);
        continue;
      }

      // (2) Top-level jump guard (single- AND multi-level): real numbering
      // never skips a whole top-level. A candidate whose top-level component is
      // more than one past the highest accepted top-level is out of sequence
      // (kills the backwards/forward ETSI clause refs '5.8.2'/'5.4.4' that jump
      // to top-level 5 in a doc whose real tree is rooted at 3). The very first
      // heading (maxTopLevel === 0) establishes the baseline and is exempt.
      if (maxTopLevel > 0 && topLevel > maxTopLevel + 1) {
        if (current) buf.push(line);
        continue;
      }

      // (3) Phantom single-level guard: a BACKWARDS single-level heading (its
      // top-level <= the highest accepted top-level) appearing after deeper
      // ('a.b') sections exist, whose own top-level was never opened as a bare
      // single-level heading, is quoted/foreign text (e.g. CRA article '1.'/'2.'
      // pasted into a late answer) — the doc's real structure opened no bare
      // top-levels there. A forward single-level (== maxTopLevel + 1, already
      // permitted by guard 2) is a genuine new top-level and is exempt.
      if (
        !isMultiLevel &&
        sawMultiLevel &&
        topLevel <= maxTopLevel &&
        !openedTopLevels.has(topLevel)
      ) {
        if (current) buf.push(line);
        continue;
      }

      flush();
      const parent = num.includes('.') ? num.split('.').slice(0, -1).join('.') : null;
      current = { sectionNumber: num, title: m[2].trim(), content: '', parentSection: parent };
      if (topLevel > maxTopLevel) maxTopLevel = topLevel;
      if (isMultiLevel) sawMultiLevel = true;
      else openedTopLevels.add(topLevel);
    } else if (current && line) {
      buf.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    throw new Error(`${docId}: parsed zero sections — refusing to emit an empty document (no silent fallbacks)`);
  }

  // Collapse duplicate section_numbers (last-write-wins, mirroring the DB's
  // INSERT OR REPLACE + UNIQUE behaviour for guidance sections). A document
  // genuinely re-uses a number only via scrape/OCR artifacts; keeping the
  // last occurrence preserves section_number as a stable key.
  const byNumber = new Map<string, ParsedSection>();
  for (const sec of sections) byNumber.set(sec.sectionNumber, sec);
  return Array.from(byNumber.values());
}

export interface GuidanceSeedDoc {
  id: string;
  title: string;
  issuing_body: string;
  document_reference: string | null;
  date_published: string | null;
  related_regulation: 'CRA' | 'NIS2' | 'DORA';
  url: string;
  pdf_url: string | null;
  status: 'published' | 'draft' | 'planned';
  metadata: Record<string, unknown> & { license: string };
  sections: Array<{
    section_number: string;
    title: string;
    content: string;
    parent_section: string | null;
  }>;
}

export function writeSeed(doc: GuidanceSeedDoc): void {
  if (!doc.metadata.license) {
    throw new Error(`${doc.id}: metadata.license missing — attribution standard violation`);
  }
  if (doc.status === 'published' && doc.sections.length === 0) {
    throw new Error(`${doc.id}: published document with zero sections`);
  }
  mkdirSync(SEED_DIR, { recursive: true });
  writeFileSync(join(SEED_DIR, `${doc.id}.json`), JSON.stringify(doc, null, 2) + '\n', 'utf-8');
}
