import { describe, it, expect } from 'vitest';
import {
  celexToEliBase,
  buildArticleSourceUrl,
  buildRecitalSourceUrl,
} from '../../src/utils/eur-lex-url.js';

describe('celexToEliBase', () => {
  it('maps a Regulation CELEX (GDPR) to its ELI base URL', () => {
    expect(celexToEliBase('32016R0679')).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    );
  });

  it('maps a Directive CELEX (NIS2) to its ELI base URL', () => {
    expect(celexToEliBase('32022L2555')).toBe(
      'https://eur-lex.europa.eu/eli/dir/2022/2555/oj',
    );
  });

  it('maps a Decision CELEX to its ELI base URL', () => {
    expect(celexToEliBase('32019D0553')).toBe(
      'https://eur-lex.europa.eu/eli/dec/2019/553/oj',
    );
  });

  it('strips leading zeros from the document number (679 not 0679)', () => {
    expect(celexToEliBase('32016R0679')).toContain('/679/');
    expect(celexToEliBase('32016R0679')).not.toContain('/0679/');
  });

  it('returns null for malformed CELEX input', () => {
    expect(celexToEliBase('not-a-celex')).toBeNull();
    expect(celexToEliBase('')).toBeNull();
    expect(celexToEliBase('32016X0679')).toBeNull();
  });

  it('returns null for null/undefined inputs', () => {
    expect(celexToEliBase(null)).toBeNull();
    expect(celexToEliBase(undefined)).toBeNull();
  });
});

describe('buildArticleSourceUrl', () => {
  it('appends #art_N for a plain numeric article', () => {
    expect(buildArticleSourceUrl('32016R0679', '32')).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj#art_32',
    );
  });

  it('preserves letter suffixes on the article number (5a)', () => {
    expect(buildArticleSourceUrl('32016R0679', '5a')).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj#art_5a',
    );
  });

  it('falls back to the regulation-level URL for Annex references', () => {
    // EUR-Lex ELI anchors for annexes aren't universally predictable from the
    // article number alone (some regulations publish them under #anx_N, others
    // don't anchor at all). The regulation-level page still resolves, so a
    // working link beats a broken anchor for the Annex case.
    expect(buildArticleSourceUrl('32016R0679', 'Annex I')).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
    );
  });

  it('returns null when the CELEX cannot be parsed', () => {
    expect(buildArticleSourceUrl('bogus', '32')).toBeNull();
    expect(buildArticleSourceUrl(null, '32')).toBeNull();
  });
});

describe('buildRecitalSourceUrl', () => {
  it('appends #rct_N for a recital number', () => {
    expect(buildRecitalSourceUrl('32016R0679', 83)).toBe(
      'https://eur-lex.europa.eu/eli/reg/2016/679/oj#rct_83',
    );
  });

  it('returns null when the CELEX cannot be parsed', () => {
    expect(buildRecitalSourceUrl('bogus', 1)).toBeNull();
    expect(buildRecitalSourceUrl(null, 1)).toBeNull();
  });
});
