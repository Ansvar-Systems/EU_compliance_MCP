import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseAnnexes, validateAiActAnnexes } from '../../scripts/ingest-eurlex.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURE = readFileSync(
  join(__dirname, '..', 'fixtures', 'eurlex-ai-act-annexes.html'),
  'utf-8',
);

describe('parseAnnexes (AI Act fixture)', () => {
  const annexes = parseAnnexes(FIXTURE);

  it('extracts exactly 13 annexes', () => {
    expect(annexes).toHaveLength(13);
  });

  it('uses canonical "Annex N" numbering with uppercase Roman numerals', () => {
    const expectedNumbers = [
      'Annex I', 'Annex II', 'Annex III', 'Annex IV', 'Annex V',
      'Annex VI', 'Annex VII', 'Annex VIII', 'Annex IX', 'Annex X',
      'Annex XI', 'Annex XII', 'Annex XIII',
    ];
    expect(annexes.map((a) => a.number)).toEqual(expectedNumbers);
  });

  it('assigns a non-empty title to each annex', () => {
    for (const annex of annexes) {
      expect(annex.title).toBeTruthy();
      expect(annex.title.length).toBeGreaterThan(5);
    }
  });

  it('each annex body has at least 500 characters', () => {
    for (const annex of annexes) {
      expect(annex.text.length).toBeGreaterThanOrEqual(500);
    }
  });

  it('Annex III mentions the 8 high-risk areas', () => {
    const a3 = annexes.find((a) => a.number === 'Annex III')!;
    const lower = a3.text.toLowerCase();
    for (const keyword of [
      'biometric',
      'critical infrastructure',
      'education',
      'employment',
      'essential',
      'law enforcement',
      'migration',
      'administration of justice',
    ]) {
      expect(lower).toContain(keyword);
    }
  });

  it('Annex XI mentions training data and compute', () => {
    const a11 = annexes.find((a) => a.number === 'Annex XI')!;
    expect(a11.text.toLowerCase()).toContain('training');
    expect(a11.text.toLowerCase()).toMatch(/floating point|computational|compute/);
  });

  it('Annex XIII mentions systemic risk', () => {
    const a13 = annexes.find((a) => a.number === 'Annex XIII')!;
    expect(a13.text.toLowerCase()).toContain('systemic risk');
  });

  it('integration: parseAnnexes output is structurally consistent with seed JSON Article shape', () => {
    const asArticles = annexes.map((a) => ({
      number: a.number,
      title: a.title,
      text: a.text,
    }));
    for (const art of asArticles) {
      expect(typeof art.number).toBe('string');
      expect(art.number.startsWith('Annex ')).toBe(true);
      expect(typeof art.title).toBe('string');
      expect(typeof art.text).toBe('string');
    }
  });
});

describe('validateAiActAnnexes', () => {
  const goodAnnexes = parseAnnexes(FIXTURE);
  const art113Short =
    'This Regulation shall enter into force on the twentieth day following that ' +
    'of its publication in the Official Journal. It shall apply from 2 August 2026.';

  it('accepts valid AI Act annexes with short Article 113', () => {
    expect(() => validateAiActAnnexes(goodAnnexes, art113Short)).not.toThrow();
  });

  it('rejects when fewer than 13 annexes present', () => {
    expect(() => validateAiActAnnexes(goodAnnexes.slice(0, 12), art113Short)).toThrow(
      /expected 13 annexes/,
    );
  });

  it('rejects when Article 113 is still over 4000 chars', () => {
    const longArt113 = 'x'.repeat(5000);
    expect(() => validateAiActAnnexes(goodAnnexes, longArt113)).toThrow(/under 4000/);
  });

  it('rejects when Article 113 still contains ANNEX markers', () => {
    const polluted = art113Short + '\nANNEX I\nList of harmonisation...';
    expect(() => validateAiActAnnexes(goodAnnexes, polluted)).toThrow(/ANNEX markers/);
  });
});

// Bare unnumbered `ANNEX` support (PR #82): acts with exactly one annex
// (e.g. Commission Implementing Regulation (EU) 2024/2690) write a bare
// `ANNEX` marker with no Roman numeral. The parser defaults these to
// "Annex I". Annexes are merged into the articles array at ingest, so this
// lands at canonical ref {id}:art_Annex I in build-db.
const wrapBody = (body: string) => `<html><body>${body}</body></html>`;

describe('parseAnnexes — bare unnumbered ANNEX', () => {
  it('a single unnumbered ANNEX yields exactly one annex labeled "Annex I"', () => {
    const html = wrapBody(
      [
        'ANNEX',
        'TECHNICAL AND METHODOLOGICAL REQUIREMENTS',
        'This annex sets out the technical and methodological requirements ' +
          'referred to in Article 21(5) of Directive (EU) 2022/2555.',
        '1. Policy on the security of network and information systems.',
        '2. Risk management framework and supporting procedures.',
      ].join('\n'),
    );

    const annexes = parseAnnexes(html);

    expect(annexes).toHaveLength(1);
    expect(annexes[0].number).toBe('Annex I');
    expect(annexes[0].title).toBe('TECHNICAL AND METHODOLOGICAL REQUIREMENTS');
    expect(annexes[0].text).toContain('technical and methodological requirements');
  });

  it('mixed: numbered annexes plus a trailing bare ANNEX — documents actual behavior', () => {
    const html = wrapBody(
      [
        'ANNEX I',
        'First numbered annex title',
        'Body content of the first numbered annex.',
        'ANNEX II',
        'Second numbered annex title',
        'Body content of the second numbered annex.',
        'ANNEX',
        'Trailing bare annex title',
        'Body content of the trailing bare annex.',
      ].join('\n'),
    );

    const annexes = parseAnnexes(html);

    // QUIRK: the bare ANNEX defaults to "Annex I" UNCONDITIONALLY — the parser
    // does not detect that a numbered "Annex I" already exists, nor does it
    // renumber to the next free slot. In a document that mixes numbered and
    // bare markers (not a real EUR-Lex shape — bare ANNEX is only used by
    // single-annex acts), the result therefore carries a DUPLICATE "Annex I":
    // the genuine first annex and the bare one collide on number/canonical
    // ref. This test pins that behavior so a future change is a conscious one.
    expect(annexes).toHaveLength(3);
    expect(annexes.map((a) => a.number)).toEqual(['Annex I', 'Annex II', 'Annex I']);

    // The two "Annex I" entries are distinct annexes by title/body — only the
    // number (and thus the {id}:art_Annex I canonical ref) collides.
    const annexOnes = annexes.filter((a) => a.number === 'Annex I');
    expect(annexOnes).toHaveLength(2);
    expect(annexOnes[0].title).toBe('First numbered annex title');
    expect(annexOnes[1].title).toBe('Trailing bare annex title');
  });
});
