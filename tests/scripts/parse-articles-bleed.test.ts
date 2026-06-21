import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseArticles, type Article } from '../../scripts/ingest-eurlex.js';

describe('parseArticles is importable for unit testing', () => {
  it('exports parseArticles as a function', () => {
    expect(typeof parseArticles).toBe('function');
  });
  it('exports the Article type (compile-time)', () => {
    const a: Article = { number: '1', text: 'x' };
    expect(a.number).toBe('1');
  });
});

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLEED_FIXTURE = readFileSync(
  join(__dirname, '..', 'fixtures', 'eurlex-chapter-section-bleed.html'),
  'utf-8',
);

// The exact uppercase structural-heading tails that must never end an article body.
const HEADING_TAILS = ['PROHIBITED AI PRACTICES', 'HIGH-RISK AI SYSTEMS', 'SECTION 1', 'AI LITERACY'];

describe('parseArticles does not bleed chapter/section headings into the preceding article', () => {
  const { articles } = parseArticles(BLEED_FIXTURE, 'TEST_CELEX');
  const byNum = (n: string) => articles.find((a) => a.number === n)!;

  it('art_4 body ends with its own sentence, not the CHAPTER III title', () => {
    const art4 = byNum('4');
    expect(art4.text.trimEnd()).toMatch(/AI systems on their behalf\.$/);
    expect(art4.text).not.toContain('PROHIBITED AI PRACTICES');
  });

  it('art_5 body ends with its own sentence, not the CHAPTER III / SECTION 1 block', () => {
    const art5 = byNum('5');
    expect(art5.text.trimEnd()).toMatch(/shall be prohibited\.$/);
    for (const tail of ['HIGH-RISK AI SYSTEMS', 'SECTION 1', 'Classification of AI systems as high-risk']) {
      expect(art5.text).not.toContain(tail);
    }
  });

  it('no article body ends with an all-caps structural heading line', () => {
    for (const a of articles) {
      const lastLine = a.text.split('\n').map((l) => l.trim()).filter(Boolean).at(-1) ?? '';
      expect(HEADING_TAILS).not.toContain(lastLine);
    }
  });
});

describe('committed seed JSON carries no bled trailing headings', () => {
  const SEED_DIR = join(__dirname, '..', '..', 'data', 'seed');
  const files = readdirSync(SEED_DIR).filter((f) => f.endsWith('.json') && !f.startsWith('mappings'));

  it('AI_ACT art_4 / art_5 do not end with a structural heading', () => {
    const aiAct = JSON.parse(readFileSync(join(SEED_DIR, 'ai-act.json'), 'utf-8'));
    const byNum = (n: string) => aiAct.articles.find((a: { number: string }) => a.number === n);
    expect(byNum('4').text.trimEnd()).not.toMatch(/PROHIBITED AI PRACTICES$/);
    expect(byNum('5').text.trimEnd()).not.toMatch(/(HIGH-RISK AI SYSTEMS|SECTION\s*1|Classification of AI systems as high-risk)$/);
  });

  it('no article body bleeds an all-caps multi-word heading after real content', () => {
    // WS2 targets the bleed where a CHAPTER/SECTION heading is appended AFTER an
    // article's real body. A body that is ENTIRELY a single title/heading block
    // (a pre-existing degenerate stub, e.g. an annex whose only seed content was
    // a correlation table that the repair removed) is not this bleed class —
    // build-db indexes that lone title into content_fts.title regardless. Scope
    // the assertion to bodies that carry real content BEFORE the trailing heading.
    for (const file of files) {
      const reg = JSON.parse(readFileSync(join(SEED_DIR, file), 'utf-8'));
      for (const art of reg.articles ?? []) {
        const blocks = String(art.text).split('\n\n').map((b: string) => b.trim()).filter(Boolean);
        if (blocks.length < 2) continue; // single-block title/stub: not a bleed-after-content
        const last = blocks[blocks.length - 1];
        const isHeading = /^[A-Z][A-Z\s-]{4,}$/.test(last) && last.split(/\s+/).length >= 2 && !/[.!?]$/.test(last);
        expect(isHeading, `${reg.id}:art_${art.number} bleeds heading after content: ${last}`).toBe(false);
      }
    }
  });
});
