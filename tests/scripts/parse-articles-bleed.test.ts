import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
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
