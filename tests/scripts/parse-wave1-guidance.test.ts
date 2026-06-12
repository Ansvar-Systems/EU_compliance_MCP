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
