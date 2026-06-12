import { describe, it, expect } from 'vitest';
import { parseNumberedSections, writeSeed } from '../../scripts/eu-guidance-wave1-common.js';

const SAMPLE = [
  'Some preamble before the first heading.',
  '1. Introduction',
  'This guidance explains the scope.',
  'It has two lines.',
  '1.1 Definitions',
  'Key terms are defined here.',
  '2. Obligations',
  'Manufacturers shall do things.',
].join('\n');

describe('parseNumberedSections', () => {
  it('splits text into numbered sections with hierarchy', () => {
    const sections = parseNumberedSections(SAMPLE, 'TEST_DOC');
    expect(sections.map((s) => s.sectionNumber)).toEqual(['1', '1.1', '2']);
    expect(sections[0].title).toBe('Introduction');
    expect(sections[0].content).toContain('two lines');
    expect(sections[1].parentSection).toBe('1');
    expect(sections[2].parentSection).toBeNull();
  });

  it('throws on text producing zero sections (fail-loud)', () => {
    expect(() => parseNumberedSections('no headings here at all', 'TEST_DOC')).toThrow(/zero sections/i);
  });

  it('rejects footnote-style single numbers without a period/paren', () => {
    // "1 See Regulation ..." is a footnote, not a heading: single-level
    // numbers need a period or paren AND an uppercase title.
    const text = [
      '1. Introduction',
      'Body text for the introduction section.',
      '1 See Regulation (EU) 2024/2847 for the definition.',
      'More introduction body that should stay in section 1.',
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    expect(sections.map((s) => s.sectionNumber)).toEqual(['1']);
    expect(sections[0].content).toContain('See Regulation');
  });

  it('rejects single-number headings whose title does not start uppercase', () => {
    const text = [
      '1. Scope',
      'Scope body.',
      '2. paragraph 1 of the Article applies', // lowercase title start → not a heading
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    expect(sections.map((s) => s.sectionNumber)).toEqual(['1']);
    expect(sections[0].content).toContain('paragraph 1 of the Article');
  });

  it("ignores '<n>.0' false matches (version stamps, 'CC BY 4.0')", () => {
    const text = [
      '1. Overview',
      'Overview body.',
      '4.0 International (CC BY 4.0) licence applies to this document.',
      '1.1 Real subsection',
      'Subsection body.',
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    expect(sections.map((s) => s.sectionNumber)).toEqual(['1', '1.1']);
    // The '4.0' line is folded into the preceding section's content.
    expect(sections[0].content).toContain('CC BY 4.0');
  });

  it('rejects 4-digit single-level numbers as year artifacts', () => {
    // "…by 30 October\n2026. The vertical standards…" — the year is not a heading.
    const text = [
      '1. Scope',
      'The obligations apply by 30 October',
      '2026. The vertical standards under development cover the categories.',
      '1.1 Details',
      'Subsection body.',
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    expect(sections.map((s) => s.sectionNumber)).not.toContain('2026');
    expect(sections.map((s) => s.sectionNumber)).toEqual(['1', '1.1']);
    // The year line folds into the preceding section's content.
    expect(sections[0].content).toContain('2026. The vertical standards');
  });

  it('rejects quoted-article single-level headings appearing late among deeper sections', () => {
    // Real structure is 4.6 → 4.6.1 (no top-level "1"/"2" ever opened). Quoted
    // CRA article text "1. Notwithstanding…" / "2. For the purposes…" must NOT
    // become sections — they stay inside 4.6.1's content.
    const text = [
      '4.6 Other obligations',
      'Intro to other obligations.',
      '4.6.1 Can a third-country manufacturer directly place products on the Union market?',
      'No. A third-country manufacturer must designate an importer established in the Union.',
      '1. Notwithstanding any obligations of x.',
      '2. For the purposes of this Article y.',
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    const nums = sections.map((s) => s.sectionNumber);
    expect(nums).not.toContain('1');
    expect(nums).not.toContain('2');
    expect(nums).toEqual(['4.6', '4.6.1']);
    const answer = sections.find((s) => s.sectionNumber === '4.6.1')!;
    expect(answer.content).toContain('third-country manufacturer must designate');
    expect(answer.content).toContain('Notwithstanding any obligations');
    expect(answer.content).toContain('For the purposes of this Article');
  });

  it('rejects backwards-jumping multi-level headings (ETSI clause refs)', () => {
    // Real ordered 3.1 → 3.2; then ETSI clause refs "5.8.2 ensure" / "5.4.4
    // require" jump to a top-level (5) that was never opened. Neither becomes a
    // section; both lines stay in 3.2's content.
    const text = [
      '3.1 Security requirements',
      'Requirement body.',
      '3.2 Vulnerability handling requirements',
      'Handling body.',
      '5.8.2 ensure z',
      '5.4.4 require w',
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    const nums = sections.map((s) => s.sectionNumber);
    expect(nums).not.toContain('5.8.2');
    expect(nums).not.toContain('5.4.4');
    expect(nums).toEqual(['3.1', '3.2']);
    const last = sections.find((s) => s.sectionNumber === '3.2')!;
    expect(last.content).toContain('5.8.2 ensure z');
    expect(last.content).toContain('5.4.4 require w');
  });

  it('collapses duplicate section numbers (last-write-wins)', () => {
    const text = [
      '1. First',
      'First body — earlier copy.',
      '2. Second',
      'Second body.',
      '1. First',
      'First body — later copy wins.',
    ].join('\n');
    const sections = parseNumberedSections(text, 'TEST_DOC');
    expect(sections.map((s) => s.sectionNumber)).toEqual(['1', '2']);
    const first = sections.find((s) => s.sectionNumber === '1')!;
    expect(first.content).toContain('later copy wins');
  });
});

describe('writeSeed (fail-loud paths)', () => {
  const baseDoc = () => ({
    id: 'TEST_DOC',
    title: 'Test',
    issuing_body: 'ENISA',
    document_reference: null,
    date_published: null,
    related_regulation: 'CRA' as const,
    url: 'https://example.test/doc',
    pdf_url: null,
    status: 'published' as const,
    metadata: { license: 'CC-BY-4.0' },
    sections: [
      { section_number: '1', title: 'Introduction', content: 'body', parent_section: null },
    ],
  });

  it('throws when metadata.license is missing', () => {
    const doc = baseDoc();
    // @ts-expect-error intentionally violating the metadata.license invariant
    doc.metadata = {};
    expect(() => writeSeed(doc)).toThrow(/license missing/i);
  });

  it('throws on a published document with zero sections', () => {
    const doc = baseDoc();
    doc.sections = [];
    expect(() => writeSeed(doc)).toThrow(/zero sections/i);
  });
});
