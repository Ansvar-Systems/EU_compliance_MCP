import { describe, it, expect } from 'vitest';
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
