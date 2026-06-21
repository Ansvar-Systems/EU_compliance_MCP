import { describe, it, expect } from 'vitest';
import { stripBledHeadings } from '../../scripts/fix-heading-bleed-seeds.js';

describe('stripBledHeadings', () => {
  it('moves a trailing CHAPTER title block off the body', () => {
    const r = stripBledHeadings(
      'Providers and deployers shall ensure AI literacy.\n\nPROHIBITED AI PRACTICES',
    );
    expect(r.text).toBe('Providers and deployers shall ensure AI literacy.');
    expect(r.movedHeading).toBe('PROHIBITED AI PRACTICES');
  });

  it('moves a trailing CHAPTER + SECTION block (AI Act art_5 shape)', () => {
    const r = stripBledHeadings(
      'This Article shall not affect other prohibitions.\n\nHIGH-RISK AI SYSTEMS\n\nSECTION 1\n\nClassification of AI systems as high-risk',
    );
    expect(r.text).toBe('This Article shall not affect other prohibitions.');
    expect(r.movedHeading).toBe('HIGH-RISK AI SYSTEMS');
  });

  it('leaves a clean body untouched', () => {
    const clean = 'An AI system shall be considered high-risk where conditions are met.';
    const r = stripBledHeadings(clean);
    expect(r.text).toBe(clean);
    expect(r.movedHeading).toBeNull();
  });

  it('does not strip a legitimate all-caps acronym sentence end', () => {
    const t = 'The provider shall notify the competent authority, including the AI Office.';
    const r = stripBledHeadings(t);
    expect(r.text).toBe(t);
    expect(r.movedHeading).toBeNull();
  });
});
