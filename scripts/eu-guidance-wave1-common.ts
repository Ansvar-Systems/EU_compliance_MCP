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

const HEADING_RE = /^(\d+(?:\.\d+)*)\.?\s+(\S.{0,150})$/;

export function parseNumberedSections(text: string, docId: string): ParsedSection[] {
  const sections: ParsedSection[] = [];
  let current: ParsedSection | null = null;
  let buf: string[] = [];

  const flush = () => {
    if (current) {
      current.content = buf.join('\n').trim();
      sections.push(current);
    }
    buf = [];
  };

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const m = line.match(HEADING_RE);
    if (m) {
      flush();
      const num = m[1];
      const parent = num.includes('.') ? num.split('.').slice(0, -1).join('.') : null;
      current = { sectionNumber: num, title: m[2].trim(), content: '', parentSection: parent };
    } else if (current && line) {
      buf.push(line);
    }
  }
  flush();

  if (sections.length === 0) {
    throw new Error(`${docId}: parsed zero sections — refusing to emit an empty document (no silent fallbacks)`);
  }
  return sections;
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
