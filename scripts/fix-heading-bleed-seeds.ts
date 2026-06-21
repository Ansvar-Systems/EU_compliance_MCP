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

/** A caption line that may trail a structural heading — a SECTION/CHAPTER
 * marker's own caption ("Classification of AI systems as high-risk",
 * "Supervision, investigation, enforcement and monitoring in respect of
 * providers of general-purpose AI models"). A caption is a single title phrase,
 * NOT a sentence. The discriminators vs real body prose:
 *   - bounded length (a caption is a heading, not a paragraph),
 *   - no terminal sentence punctuation — checked AFTER stripping trailing quotes
 *     / brackets, so a real sentence ending in `."` or `.)` is NOT mistaken for a
 *     caption (this is the CRR:art_50d over-strip guard),
 *   - no INTERNAL sentence boundary (". " followed by a letter, or ";"/":" that
 *     mark prose / table rows) — a caption is one clause, a paragraph/table row
 *     is not (the CRR:art_324 event-type-table over-strip guard).
 * Used only to peel a caption that accompanies a heading — never on its own (the
 * strip commits only up to a heading block). */
function captionLike(s: string): boolean {
  s = (s || '').trim();
  if (!s) return false;
  if (s.length > 180) return false;
  // Strip trailing closing quotes/brackets before the terminal-punctuation test,
  // so `…497(3) of Regulation (EU) No 575/2013."` reads as a sentence, not a caption.
  const tail = s.replace(/["”»’'）)\]]+$/u, '');
  if (/[.!?:;]$/.test(tail)) return false;
  // Internal sentence boundary or list/clause punctuation => prose / table row,
  // not a single-phrase caption.
  if (/[.!?]\s+\p{Lu}/u.test(s)) return false;
  if (/[;:]/.test(s)) return false;
  return true;
}

/** A long all-caps chapter title that the canonical headingLike misses because
 * of its <=70-char / <=8-word ceiling (e.g. AI Act CHAPTER IV
 * "TRANSPARENCY OBLIGATIONS FOR PROVIDERS AND DEPLOYERS OF CERTAIN AI SYSTEMS",
 * or DORA RTS chapter captions that run 20+ all-caps words). headingLike stays
 * verbatim (shared with the bleed gate); this complement only widens what
 * stripBledHeadings will peel, never what the gate flags. The discriminator is
 * "mostly-uppercase, multi-word, no terminal punctuation": a real body sentence
 * is mixed-case and/or ends in .!? and is excluded. The strip commits a cut only
 * up to such a block AND only when it is preceded by real body content, so a long
 * word count cannot eat prose. */
function allCapsTitleLike(s: string): boolean {
  s = (s || '').trim();
  if (!s) return false;
  if (/[.!?]$/.test(s)) return false;
  if (s.length > 250) return false;
  const words = s.split(/\s+/).length;
  if (words < 2) return false;
  const alpha = [...s].filter((ch) => /\p{L}/u.test(ch));
  if (alpha.length < 6) return false;
  const up = alpha.filter((ch) => ch.toUpperCase() === ch && ch.toLowerCase() !== ch).length;
  return up / alpha.length >= 0.85;
}

/** True for any block the strip treats as a structural heading (the canonical
 * headingLike OR a long all-caps chapter title it misses). */
function isHeadingBlock(s: string): boolean {
  return headingLike(s) || allCapsTitleLike(s);
}

/**
 * Remove the trailing structural-heading tail from a body; return cleaned text
 * + the first (topmost) moved heading.
 *
 * A bled structural tail is an alternating run of `<heading>` markers and the
 * single `<caption>` each one introduces — e.g. "… SECTION 5\n\n<caption>" or
 * "… TITLE IV\n\nOWN FUNDS …\n\nCHAPTER 1\n\nGeneral Provisions". Scanning from
 * the END we peel:
 *   - any heading block (CHAPTER/SECTION/TITLE marker or all-caps title), and
 *   - a caption block ONLY when the block immediately deeper (toward the body)
 *     is itself a heading — i.e. the caption belongs to a heading that follows
 *     it in document order. This is the guard against an embedded TABLE whose
 *     rows are short non-sentence phrases (CRR:art_324 event-type table): two
 *     consecutive caption rows are NOT a heading+caption pair, so the scan stops
 *     at the table and only the genuinely-bled heading after it is removed.
 * We COMMIT the cut only up to the furthest heading block, so a real article
 * body sentence is never stripped and a lone trailing caption (no heading) is
 * left untouched.
 */
export function stripBledHeadings(text: string): { text: string; movedHeading: string | null } {
  const blocks = text.split('\n\n');
  // i = index of the first block belonging to the trailing structural tail.
  let i = blocks.length;
  let lastHeadingIdx = -1; // furthest-back heading block within the tail
  for (let j = blocks.length - 1; j > 0; j--) {
    const b = blocks[j].trim();
    if (isHeadingBlock(b)) {
      i = j;
      lastHeadingIdx = j;
    } else if (captionLike(b) && isHeadingBlock((blocks[j - 1] ?? '').trim())) {
      // A caption whose next-deeper block is a heading: the caption that this
      // following heading introduces. Part of the structural tail. (The strip
      // still commits only up to lastHeadingIdx, set when that heading is hit.)
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
