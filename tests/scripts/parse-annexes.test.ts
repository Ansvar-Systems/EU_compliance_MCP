import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parseAnnexes } from '../../scripts/ingest-eurlex.js';

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
});
