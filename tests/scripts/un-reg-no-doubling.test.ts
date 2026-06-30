import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

// Regression guard for the 2026-06-29 UN-regulation provision-body doubling.
// ingest-unece.ts selected `p, span, td` and so collected each EUR-Lex cell's
// text TWICE — once via the wrapping <td> and once via its inner <p>/<span> —
// making every provision segment appear twice in succession
// ("General specifications\n\nGeneral specifications"). The fix selects only
// leaf elements. These seeds are produced by that parser; assert they carry no
// consecutive-duplicate segments so the doubling cannot silently return.
function consecutiveDuplicateSegments(text: string): number {
  const segs = text
    .split('\n\n')
    .map((s) => s.trim())
    .filter(Boolean);
  let n = 0;
  for (let i = 1; i < segs.length; i++) {
    if (segs[i] === segs[i - 1]) n++;
  }
  return n;
}

describe('UN-regulation seeds carry no doubled provision text', () => {
  for (const file of ['un-r155.json', 'un-r156.json']) {
    it(`${file} has no consecutive-duplicate segments`, () => {
      const reg = JSON.parse(readFileSync(join(REPO, 'data', 'seed', file), 'utf-8'));
      for (const article of reg.articles) {
        expect(
          consecutiveDuplicateSegments(article.text),
          `${reg.id}:art_${article.number} has doubled segments`,
        ).toBe(0);
      }
    });
  }
});
