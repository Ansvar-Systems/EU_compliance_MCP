#!/usr/bin/env npx tsx
/**
 * Offline repair of heading-bleed already frozen into data/seed/*.json.
 *
 * The bleed comes from scripts/ingest-eurlex.ts:parseArticles() not consuming
 * the CHAPTER/SECTION caption line (fixed in this same WS). Re-ingesting from
 * live EUR-Lex needs Puppeteer against the WAF (bulk-reingest-all.ts) — not
 * deterministic. Since the bled text is in the committed seeds, we strip the
 * trailing structural-heading block from each article body here, deterministically.
 *
 * headingLike is copied verbatim from arch-docs corpus-quality-scan.js so the
 * repair and the bleed gate agree on what a "heading" is.
 *
 * Usage: tsx scripts/fix-heading-bleed-seeds.ts          # rewrite seeds in place
 *        tsx scripts/fix-heading-bleed-seeds.ts --dry-run
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = join(__dirname, '..', 'data', 'seed');

// VERBATIM from arch-docs scripts/audit/corpus-quality-scan.js:13-38.
export function headingLike(s: string): boolean {
  s = (s || '').trim();
  if (!s) return false;
  const words = s.split(/\s+/).length;
  const kw = /^(SECTION|CHAPTER|TITLE|PART|SUBSECTION|ANNEX|APPENDIX|KAPITEL|ABSCHNITT|UNTERABSCHNITT|CHAPITRE|TITRE|SOUS-TITRE|SOUS-SECTION|CAPITOLO|TITOLO|SEZIONE|CAPO|CAP[ÍI]TULO|T[ÍI]TULO|SECCI[ÓO]N|AVDELNING|KAPITTEL|HOOFDSTUK|TITEL|AFDELING|ROZDZIA|CZ[ĘE][ŚS][ĆC]|[ČC][ÁA]ST|HLAVA|ODD[ÍI]L|ГЛАВА|РАЗДЕЛ|ОТДЕЛ|ΚΕΦΑΛΑΙΟ|ΤΜΗΜΑ|ΤΙΤΛΟΣ|FEJEZET|PEAT[ÜU]KK|SKYRIUS|SKIRSNIS|DALIS|NODA[ĻL]A)/i;
  const numbered = /^[\p{L}]+[\s.]+([IVXLCDM]{1,7}\b|\d{1,4}\b|premi|prem|1re|1er|uniqu|[úu]nic)/iu.test(s);
  if (kw.test(s) && s.length <= 160 && (numbered || words <= 6) && (!/[.!?]$/.test(s) || words <= 6)) return true;
  if (s.length > 70) return false;
  const alpha = [...s].filter((ch) => /\p{L}/u.test(ch));
  const digits = (s.match(/[0-9]/g) || []).length;
  if (alpha.length >= 6 && words >= 2 && alpha.length >= digits) {
    const up = alpha.filter((ch) => ch.toUpperCase() === ch && ch.toLowerCase() !== ch).length;
    if (up / alpha.length >= 0.85 && words <= 8 && !/[.!?]$/.test(s)) return true;
  }
  return false;
}

/** A short caption line that may trail a structural heading (e.g. a SECTION
 * marker's own title-case caption "Classification of AI systems as high-risk").
 * Not a full sentence, not long. Used only to peel the caption that accompanies
 * a heading — never on its own (the strip commits only up to a headingLike block). */
function captionLike(s: string): boolean {
  s = (s || '').trim();
  if (!s) return false;
  return s.length <= 100 && !/[.!?]$/.test(s) && s.split(/\s+/).length <= 12;
}

/**
 * Remove the trailing structural-heading tail from a body; return cleaned text
 * + the first (topmost) moved heading.
 *
 * The bled tail is a maximal run of trailing blocks that are either headingLike
 * (e.g. "HIGH-RISK AI SYSTEMS", "SECTION 1") or a short caption that accompanies
 * a heading (e.g. "Classification of AI systems as high-risk"). We accumulate
 * trailing heading/caption blocks but only COMMIT the cut up to the furthest
 * headingLike block — so a real article body sentence is never stripped, and a
 * lone trailing caption (with no heading) is left untouched.
 */
export function stripBledHeadings(text: string): { text: string; movedHeading: string | null } {
  const blocks = text.split('\n\n');
  // i = index of the first block belonging to the trailing structural tail.
  let i = blocks.length;
  let lastHeadingIdx = -1; // furthest-back headingLike block within the tail
  for (let j = blocks.length - 1; j > 0; j--) {
    const b = blocks[j].trim();
    if (headingLike(b)) {
      i = j;
      lastHeadingIdx = j;
    } else if (lastHeadingIdx !== -1 && captionLike(b)) {
      // A caption block ABOVE an already-found heading (between body and heading)
      // — part of the same structural tail (e.g. a section title above its marker).
      i = j;
    } else if (captionLike(b)) {
      // A trailing caption with no heading found yet: candidate, keep scanning,
      // but do NOT commit unless a heading turns up further back.
      i = j;
    } else {
      break;
    }
  }
  if (lastHeadingIdx === -1) {
    return { text: text.trimEnd(), movedHeading: null };
  }
  const movedHeading = blocks[i].trim();
  return { text: blocks.slice(0, i).join('\n\n').trimEnd(), movedHeading };
}

function main(): void {
  const dryRun = process.argv.includes('--dry-run');
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('mappings'));
  let moved = 0;
  for (const file of files) {
    const path = join(SEED_DIR, file);
    const reg = JSON.parse(readFileSync(path, 'utf-8'));
    let changed = false;
    for (const art of reg.articles ?? []) {
      const { text, movedHeading } = stripBledHeadings(String(art.text ?? ''));
      if (movedHeading) {
        art.text = text;
        moved++;
        changed = true;
        console.log(`  ${reg.id}:art_${art.number} <- removed bled heading: ${movedHeading}`);
      }
    }
    if (changed && !dryRun) writeFileSync(path, JSON.stringify(reg, null, 2) + '\n');
  }
  console.log(`${dryRun ? '[dry-run] ' : ''}cleaned ${moved} bled headings across ${files.length} seed files`);
}

// Run only when invoked directly as a CLI (tsx scripts/fix-heading-bleed-seeds.ts),
// NOT when imported by a test/another module — importing must have no side effects.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
