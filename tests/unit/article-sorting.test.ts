import { describe, it, expect } from 'vitest';

describe('Article Number Sorting', () => {
  it('should sort article numbers with letter suffixes correctly', () => {
    const articles = [
      { number: '10', text: 'Article 10' },
      { number: '5b', text: 'Article 5b' },
      { number: '5', text: 'Article 5' },
      { number: '5a', text: 'Article 5a' },
      { number: '10a', text: 'Article 10a' },
      { number: '6', text: 'Article 6' },
    ];

    const sorted = articles.sort((a, b) => {
      const matchA = a.number.match(/^(\d+)([a-z]?)$/);
      const matchB = b.number.match(/^(\d+)([a-z]?)$/);
      if (!matchA || !matchB) return 0;

      const numA = parseInt(matchA[1]);
      const numB = parseInt(matchB[1]);

      if (numA !== numB) return numA - numB;
      return (matchA[2] || '').localeCompare(matchB[2] || '');
    });

    expect(sorted.map(a => a.number)).toEqual(['5', '5a', '5b', '6', '10', '10a']);
  });

  it('should sort UN regulation sections and annexes correctly', () => {
    const articles = [
      { number: 'Annex 2', text: 'Annex 2' },
      { number: '5', text: 'Section 5' },
      { number: 'Annex 1a', text: 'Annex 1a' },
      { number: '10', text: 'Section 10' },
      { number: 'Annex 1', text: 'Annex 1' },
      { number: '5a', text: 'Section 5a' },
    ];

    const sorted = articles.sort((a, b) => {
      const aIsAnnex = a.number.startsWith('Annex');
      const bIsAnnex = b.number.startsWith('Annex');
      if (aIsAnnex && !bIsAnnex) return 1;
      if (!aIsAnnex && bIsAnnex) return -1;

      if (aIsAnnex && bIsAnnex) {
        const matchA = a.number.match(/Annex (\d+)([a-z]?)/);
        const matchB = b.number.match(/Annex (\d+)([a-z]?)/);
        if (!matchA || !matchB) return 0;
        const numA = parseInt(matchA[1]);
        const numB = parseInt(matchB[1]);
        if (numA !== numB) return numA - numB;
        return (matchA[2] || '').localeCompare(matchB[2] || '');
      }

      const matchA = a.number.match(/^(\d+)([a-z]?)$/);
      const matchB = b.number.match(/^(\d+)([a-z]?)$/);
      if (!matchA || !matchB) return 0;
      const numA = parseInt(matchA[1]);
      const numB = parseInt(matchB[1]);
      if (numA !== numB) return numA - numB;
      return (matchA[2] || '').localeCompare(matchB[2] || '');
    });

    expect(sorted.map(a => a.number)).toEqual([
      '5', '5a', '10', 'Annex 1', 'Annex 1a', 'Annex 2'
    ]);
  });
});
