export interface DataSource {
  name: string;
  description: string;
  url: string;
  license: string;
  content_types: string[];
  regulation_ids?: string[];
}

export interface ListSourcesResult {
  sources: DataSource[];
  coverage_summary: {
    total_regulations: number;
    total_articles: number;
    total_definitions: number;
    total_recitals: number;
  };
  update_schedule: string;
  authenticity_note: string;
}

export function listSources(): ListSourcesResult {
  return {
    sources: [
      {
        name: 'EUR-Lex',
        description:
          'The official EU law repository maintained by the Publications Office of the European Union. ' +
          'Provides consolidated regulation texts, recitals, and definitions.',
        url: 'https://eur-lex.europa.eu',
        license: 'CC BY 4.0 (reusable with attribution)',
        content_types: ['regulations', 'directives', 'decisions', 'recitals', 'definitions'],
        regulation_ids: [
          'GDPR', 'NIS2', 'DORA', 'AI_ACT', 'CRA', 'CYBERSECURITY_ACT', 'CYBER_SOLIDARITY',
          'EPRIVACY', 'LED', 'EUCC', 'EIDAS2', 'DATA_ACT', 'DSA', 'DMA', 'DGA', 'EECC',
          'EHDS', 'MDR', 'IVDR', 'MICA', 'PSD2', 'MIFID2', 'MIFIR', 'AIFMD', 'SFDR',
          'EU_TAXONOMY', 'CHIPS_ACT', 'CRMA', 'GPSR', 'MACHINERY', 'PLD', 'RED',
          'CSRD', 'CSDDD', 'CBAM', 'EUDR', 'CER',
        ],
      },
      {
        name: 'UNECE',
        description:
          'United Nations Economic Commission for Europe. Source for UN Regulations on vehicle ' +
          'cybersecurity and software updates.',
        url: 'https://unece.org',
        license: 'Public domain',
        content_types: ['UN regulations', 'vehicle standards'],
        regulation_ids: ['UN_R155', 'UN_R156'],
      },
      {
        name: 'ENISA',
        description:
          'EU Agency for Cybersecurity. Provides supplementary guidance referenced in the dataset.',
        url: 'https://www.enisa.europa.eu',
        license: 'CC BY 4.0',
        content_types: ['cybersecurity guidance', 'threat landscape reports'],
      },
    ],
    coverage_summary: {
      total_regulations: 49,
      total_articles: 2528,
      total_definitions: 1226,
      total_recitals: 3869,
    },
    update_schedule: 'Daily EUR-Lex RSS check with automatic version comparison',
    authenticity_note:
      'Only documents published in the Official Journal of the EU are deemed authentic ' +
      '(Article 297 TFEU). This dataset is derived from EUR-Lex and should be verified ' +
      'against official publications for legal purposes.',
  };
}
