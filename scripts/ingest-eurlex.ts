#!/usr/bin/env npx tsx

/**
 * Ingest EU regulations from EUR-Lex.
 *
 * Usage: npx tsx scripts/ingest-eurlex.ts <celex_id> <output_file> [--browser]
 * Example: npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json
 * Example (with browser): npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json --browser
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { fetchEurLexWithBrowser } from './ingest-eurlex-browser.js';

interface Article {
  number: string;
  title?: string;
  text: string;
  chapter?: string;
}

export interface Annex {
  number: string; // canonical form: "Annex I" through "Annex XIII"
  title: string;
  text: string;
}

/**
 * Extract EU-regulation annexes from EUR-Lex HTML.
 *
 * Recognises ANNEX markers in the line-oriented body text. Each annex starts
 * at its marker line, ends at the next marker or end of body. The first short
 * non-empty line after the marker is treated as the annex title.
 *
 * Exported for unit testing and for reuse by the main ingestion flow.
 */
export function parseAnnexes(html: string): Annex[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const allText = doc.body?.textContent || '';
  const lines = allText.split('\n').map((l) => l.trim());

  const annexes: Annex[] = [];
  let current: { roman: string; titleLines: string[]; bodyLines: string[] } | null = null;
  let seenTitle = false;

  const flush = () => {
    if (!current) return;
    annexes.push({
      number: `Annex ${current.roman}`,
      title: current.titleLines.join(' ').trim(),
      text: current.bodyLines.join('\n').trim(),
    });
    current = null;
    seenTitle = false;
  };

  for (const line of lines) {
    if (!line) continue;
    // Stop collecting annex body once we hit the EUR-Lex page footer (ELI
    // identifier or ISSN line). Without this the final annex picks up the
    // JS template snippet appended by the legal-content page.
    if (current && (line.match(/^ELI:\s*https?:\/\//i) || line.match(/^ISSN\s+\d{4}-\d{4}/))) {
      flush();
      break;
    }
    // Match a numbered annex marker ("ANNEX I" … "ANNEX XIII") or a single
    // unnumbered "ANNEX" (used by acts with exactly one annex, e.g. Commission
    // Implementing Regulation (EU) 2024/2690). An unnumbered annex is treated
    // as "Annex I" so it lands at canonical ref {id}:annex_I in build-db.
    const match = line.match(/^ANNEX(?:\s+([IVXLCDM]+))?$/);
    if (match) {
      flush();
      current = { roman: match[1] ?? 'I', titleLines: [], bodyLines: [] };
      seenTitle = false;
      continue;
    }
    if (!current) continue;
    if (!seenTitle) {
      // First non-empty line after the marker becomes the title.
      current.titleLines.push(line);
      seenTitle = true;
      continue;
    }
    current.bodyLines.push(line);
  }
  flush();

  return annexes;
}

/**
 * AI Act-specific sanity checks on extracted annexes. Throws on failure so the
 * ingestion script exits non-zero and the seed JSON is not overwritten with
 * a truncated or malformed document.
 */
export function validateAiActAnnexes(annexes: Annex[], article113Text: string): void {
  const expectedNumbers = [
    'Annex I', 'Annex II', 'Annex III', 'Annex IV', 'Annex V',
    'Annex VI', 'Annex VII', 'Annex VIII', 'Annex IX', 'Annex X',
    'Annex XI', 'Annex XII', 'Annex XIII',
  ];
  if (annexes.length !== 13) {
    throw new Error(`AI Act: expected 13 annexes, got ${annexes.length}`);
  }
  const actualNumbers = annexes.map((a) => a.number);
  for (let i = 0; i < expectedNumbers.length; i++) {
    if (actualNumbers[i] !== expectedNumbers[i]) {
      throw new Error(
        `AI Act annex[${i}] number mismatch: expected ${expectedNumbers[i]}, got ${actualNumbers[i]}`,
      );
    }
  }
  for (const annex of annexes) {
    if (!annex.title) throw new Error(`AI Act ${annex.number}: empty title`);
    if (annex.text.length < 500) {
      throw new Error(
        `AI Act ${annex.number}: text only ${annex.text.length} chars (minimum 500)`,
      );
    }
  }

  const a3 = annexes[2].text.toLowerCase();
  const a3Keywords = [
    'biometric', 'critical infrastructure', 'education', 'employment',
    'essential', 'law enforcement', 'migration', 'administration of justice',
  ];
  for (const kw of a3Keywords) {
    if (!a3.includes(kw)) {
      throw new Error(`AI Act Annex III missing keyword "${kw}" — parser may be truncating`);
    }
  }

  const a11 = annexes[10].text.toLowerCase();
  if (!a11.includes('training')) {
    throw new Error('AI Act Annex XI missing "training" keyword');
  }
  if (!/floating point|computational|compute/.test(a11)) {
    throw new Error('AI Act Annex XI missing compute-related keywords');
  }

  const a13 = annexes[12].text.toLowerCase();
  if (!a13.includes('systemic risk')) {
    throw new Error('AI Act Annex XIII missing "systemic risk" keyword');
  }

  if (article113Text.length > 4000) {
    throw new Error(
      `AI Act Article 113 text is ${article113Text.length} chars — ` +
        'should be under 4000 after annex extraction. Are the annexes still concatenated?',
    );
  }
  if (/ANNEX\s+(I|XIII)\b/.test(article113Text)) {
    throw new Error('AI Act Article 113 text still contains ANNEX markers');
  }
}

interface Definition {
  term: string;
  definition: string;
  article: string;
}

interface Recital {
  recital_number: number;
  text: string;
  related_articles?: string;
}

interface RegulationData {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  eur_lex_url: string;
  articles: Article[];
  definitions: Definition[];
  recitals?: Recital[];
}

const REGULATION_METADATA: Record<string, { id: string; full_name: string; effective_date?: string }> = {
  '32016R0679': { id: 'GDPR', full_name: 'General Data Protection Regulation', effective_date: '2018-05-25' },
  '32022L2555': { id: 'NIS2', full_name: 'Directive on measures for a high common level of cybersecurity across the Union', effective_date: '2024-10-17' },
  // NIS2 Implementing Regulation under Art. 21(5) — technical and methodological
  // requirements for DNS/TLD/cloud/data-centre/CDN/managed-service/MSSP/online-
  // marketplace/search-engine/social-network/trust-service entities.
  '32024R2690': { id: 'NIS2_IR_TECHNICAL_REQUIREMENTS', full_name: 'Commission Implementing Regulation (EU) 2024/2690 - Technical and Methodological Requirements for Cybersecurity Risk-Management Measures (NIS2 Art. 21)', effective_date: '2024-11-07' },
  '32022R2554': { id: 'DORA', full_name: 'Digital Operational Resilience Act', effective_date: '2025-01-17' },
  // DORA RTS under Art. 30(5) — subcontracting of ICT services supporting
  // critical or important functions. OJ-published 2025-07-02.
  '32025R0532': { id: 'DORA_RTS_SUBCONTRACTING', full_name: 'Commission Delegated Regulation (EU) 2025/532 - RTS on Subcontracting ICT Services Supporting Critical or Important Functions', effective_date: '2025-07-22' },
  '32024R1689': { id: 'AI_ACT', full_name: 'Artificial Intelligence Act', effective_date: '2024-08-01' },
  // Charter of Fundamental Rights of the European Union — primary law, OJ C 326.
  // Routing key 'CFR' is used by FRIA's fundamental_rights_mapping stage.
  '12012P/TXT': { id: 'CFR', full_name: 'Charter of Fundamental Rights of the European Union', effective_date: '2009-12-01' },
  '32024R2847': { id: 'CRA', full_name: 'Cyber Resilience Act', effective_date: '2024-12-10' },
  '32019R0881': { id: 'CYBERSECURITY_ACT', full_name: 'EU Cybersecurity Act', effective_date: '2019-06-27' },
  '32024R1183': { id: 'EIDAS2', full_name: 'European Digital Identity Framework (eIDAS 2.0)', effective_date: '2024-05-20' },
  '02014R0910-20241018': { id: 'EIDAS2', full_name: 'European Digital Identity Framework (eIDAS 2.0)', effective_date: '2024-05-20' },
  // Digital Single Market regulations
  '32023R2854': { id: 'DATA_ACT', full_name: 'Data Act', effective_date: '2025-09-12' },
  '32022R2065': { id: 'DSA', full_name: 'Digital Services Act', effective_date: '2024-02-17' },
  '32022R1925': { id: 'DMA', full_name: 'Digital Markets Act', effective_date: '2023-05-02' },
  // Product & Supply Chain regulations
  '32023R1781': { id: 'CHIPS_ACT', full_name: 'European Chips Act', effective_date: '2023-09-18' },
  '32024R1252': { id: 'CRMA', full_name: 'Critical Raw Materials Act', effective_date: '2024-05-23' },
  // UN Regulations (adopted by EU)
  '42021X0387': { id: 'UN_R155', full_name: 'UN Regulation No. 155 - Cyber security and cyber security management system', effective_date: '2021-01-22' },
  '42025X0005': { id: 'UN_R155', full_name: 'UN Regulation No. 155 - Cyber security and cyber security management system (Supplement 3)', effective_date: '2025-01-10' },
  // Financial Services regulations
  '32012R0648': { id: 'EMIR', full_name: 'European Market Infrastructure Regulation', effective_date: '2012-08-16' },
  '32024R2987': { id: 'EMIR3', full_name: 'EMIR 3.0 — Active Accounts Regulation', effective_date: '2024-12-24' },
  '32013R0575': { id: 'CRR', full_name: 'Capital Requirements Regulation', effective_date: '2014-01-01' },
  '32013L0036': { id: 'CRD', full_name: 'Capital Requirements Directive', effective_date: '2014-01-01' },
  '32009L0138': { id: 'SOLVENCY2', full_name: 'Solvency II Directive', effective_date: '2016-01-01' },
  '32014R1286': { id: 'PRIIPS', full_name: 'PRIIPs Regulation', effective_date: '2018-01-01' },
  '32009L0065': { id: 'UCITS', full_name: 'UCITS Directive', effective_date: '2011-07-01' },
  '32023R1113': { id: 'TFR', full_name: 'Transfer of Funds Regulation', effective_date: '2024-12-30' },
  // Proposed financial regulations (COM documents)
  '52023PC0366': { id: 'PSD3', full_name: 'Payment Services Directive 3 (Proposed)' },
  '52023PC0367': { id: 'PSR', full_name: 'Payment Services Regulation (Proposed)' },
  '52023PC0360': { id: 'FIDA', full_name: 'Financial Data Access Regulation (Proposed)' },
  // Pharmaceutical / Life Sciences regulations
  '32014R0536': { id: 'CTR', full_name: 'Clinical Trials Regulation', effective_date: '2022-01-31' },
  '32001L0083': { id: 'MEDICINAL_PRODUCTS_DIR', full_name: 'Directive on the Community code relating to medicinal products for human use', effective_date: '2001-11-28' },
  '02001L0083-20220101': { id: 'MEDICINAL_PRODUCTS_DIR', full_name: 'Directive on the Community code relating to medicinal products for human use', effective_date: '2001-11-28' },
  '32004R0726': { id: 'CENTRALISED_PROCEDURE_REG', full_name: 'Regulation laying down Community procedures for the authorisation and supervision of medicinal products', effective_date: '2004-04-30' },
  '02004R0726-20190128': { id: 'CENTRALISED_PROCEDURE_REG', full_name: 'Regulation laying down Community procedures for the authorisation and supervision of medicinal products', effective_date: '2004-04-30' },
  // MiCA Level 2 — Delegated Regulations (RTS) supplementing Regulation (EU) 2023/1114
  '32025R0292': { id: 'MICA_RTS_COOP_THIRD_COUNTRY', full_name: 'Commission Delegated Regulation (EU) 2025/292 — RTS on cooperation arrangement templates between competent authorities and third-country supervisors' },
  '32025R0293': { id: 'MICA_RTS_COMPLAINTS_ART', full_name: 'Commission Delegated Regulation (EU) 2025/293 — RTS on complaint-handling requirements for ART issuers' },
  '32025R0294': { id: 'MICA_RTS_COMPLAINTS_CASP', full_name: 'Commission Delegated Regulation (EU) 2025/294 — RTS on complaint-handling requirements for CASPs' },
  '32025R0296': { id: 'MICA_RTS_WHITE_PAPER_CREDIT_INST', full_name: 'Commission Delegated Regulation (EU) 2025/296 — RTS on white-paper approval procedures for ARTs issued by credit institutions' },
  '32025R0297': { id: 'MICA_RTS_SUPERVISORY_COLLEGES', full_name: 'Commission Delegated Regulation (EU) 2025/297 — RTS on supervisory colleges for significant ART/EMT issuers' },
  '32025R0298': { id: 'MICA_RTS_TRANSACTION_ESTIMATION', full_name: 'Commission Delegated Regulation (EU) 2025/298 — RTS on methodology to estimate transaction numbers and values for ARTs and non-EU-denominated EMTs' },
  '32025R0299': { id: 'MICA_RTS_CONTINUITY', full_name: 'Commission Delegated Regulation (EU) 2025/299 — RTS on continuity and regularity in the performance of crypto-asset services' },
  '32025R0300': { id: 'MICA_RTS_INFO_EXCHANGE', full_name: 'Commission Delegated Regulation (EU) 2025/300 — RTS on information exchanged between competent authorities' },
  '32025R0303': { id: 'MICA_RTS_FINANCIAL_ENTITY_NOTIFY', full_name: 'Commission Delegated Regulation (EU) 2025/303 — RTS on notification information for financial entities intending to provide crypto-asset services' },
  '32025R0305': { id: 'MICA_RTS_CASP_AUTH_INFO', full_name: 'Commission Delegated Regulation (EU) 2025/305 — RTS on information for CASP authorisation applications' },
  '32025R0413': { id: 'MICA_RTS_QUALIFYING_HOLDING_ART', full_name: 'Commission Delegated Regulation (EU) 2025/413 — RTS on qualifying holding acquisition assessment for ART issuers' },
  '32025R0414': { id: 'MICA_RTS_QUALIFYING_HOLDING_CASP', full_name: 'Commission Delegated Regulation (EU) 2025/414 — RTS on qualifying holding acquisition assessment for CASPs' },
  '32025R0415': { id: 'MICA_RTS_OWN_FUNDS_STRESS', full_name: 'Commission Delegated Regulation (EU) 2025/415 — RTS on own funds adjustment and stress testing for ART/EMT issuers' },
  '32025R0416': { id: 'MICA_RTS_ORDER_BOOK', full_name: 'Commission Delegated Regulation (EU) 2025/416 — RTS on order-book record content and format for trading-platform CASPs' },
  '32025R0417': { id: 'MICA_RTS_TRANSPARENCY', full_name: 'Commission Delegated Regulation (EU) 2025/417 — RTS on transparency data presentation for trading-platform CASPs' },
  '32025R0418': { id: 'MICA_RTS_GOVERNANCE_REMUN', full_name: 'Commission Delegated Regulation (EU) 2025/418 — RTS on governance and remuneration policy for significant ART/EMT issuers' },
  '32025R0419': { id: 'MICA_RTS_OWN_FUNDS_ADJUST', full_name: 'Commission Delegated Regulation (EU) 2025/419 — RTS on procedure and timeframe for ART/EMT issuers to adjust own funds amounts' },
  '32025R0421': { id: 'MICA_RTS_WHITE_PAPER_MACHINE_READ', full_name: 'Commission Delegated Regulation (EU) 2025/421 — RTS on crypto-asset white-paper classification data and machine-readability' },
  '32025R0422': { id: 'MICA_RTS_SUSTAINABILITY', full_name: 'Commission Delegated Regulation (EU) 2025/422 — RTS on sustainability indicators for climate and environmental impacts' },
  '32025R0885': { id: 'MICA_RTS_MARKET_ABUSE', full_name: 'Commission Delegated Regulation (EU) 2025/885 — RTS on market abuse detection and prevention' },
  '32025R1125': { id: 'MICA_RTS_ART_AUTH_INFO', full_name: 'Commission Delegated Regulation (EU) 2025/1125 — RTS on information for authorisation to offer or admit ARTs to trading' },
  '32025R1140': { id: 'MICA_RTS_RECORDS_RETENTION', full_name: 'Commission Delegated Regulation (EU) 2025/1140 — RTS on records retention for crypto-asset services, activities, orders and transactions' },
  '32025R1141': { id: 'MICA_RTS_CONFLICTS_ART', full_name: 'Commission Delegated Regulation (EU) 2025/1141 — RTS on conflicts-of-interest policies and procedures for ART issuers' },
  '32025R1142': { id: 'MICA_RTS_CONFLICTS_CASP', full_name: 'Commission Delegated Regulation (EU) 2025/1142 — RTS on conflicts-of-interest policies and disclosure for CASPs' },
  '32025R1264': { id: 'MICA_RTS_LIQUIDITY', full_name: 'Commission Delegated Regulation (EU) 2025/1264 — RTS on liquidity management policy for certain ART/EMT issuers' },
  // MiCA Level 2 — Implementing Regulations (ITS) supplementing Regulation (EU) 2023/1114
  '32024R2494': { id: 'MICA_ITS_COOP_ESAS', full_name: 'Commission Implementing Regulation (EU) 2024/2494 — ITS on competent authority cooperation with ESMA and EBA' },
  '32024R2545': { id: 'MICA_ITS_COOP_CAS', full_name: 'Commission Implementing Regulation (EU) 2024/2545 — ITS on competent authority cooperation and information exchange' },
  '32024R2861': { id: 'MICA_ITS_INSIDE_INFO', full_name: 'Commission Implementing Regulation (EU) 2024/2861 — ITS on technical means for inside-information disclosure and delayed disclosure' },
  '32024R2902': { id: 'MICA_ITS_ART_EMT_REPORTING', full_name: 'Commission Implementing Regulation (EU) 2024/2902 — ITS on reporting for ARTs and non-EU-currency-denominated EMTs' },
  '32024R2984': { id: 'MICA_ITS_WHITE_PAPER_FORMS', full_name: 'Commission Implementing Regulation (EU) 2024/2984 — ITS on crypto-asset white-paper forms, formats and templates' },
  '32025R0304': { id: 'MICA_ITS_FINANCIAL_ENTITY_FORMS', full_name: 'Commission Implementing Regulation (EU) 2025/304 — ITS on forms for crypto-asset service notifications by financial entities' },
  '32025R0306': { id: 'MICA_ITS_CASP_AUTH_FORMS', full_name: 'Commission Implementing Regulation (EU) 2025/306 — ITS on forms for CASP authorisation applications' },
  '32025R1126': { id: 'MICA_ITS_ART_AUTH_FORMS', full_name: 'Commission Implementing Regulation (EU) 2025/1126 — ITS on forms for ART authorisation applications' },
};

async function fetchEurLexHtml(celexId: string, useBrowser = false): Promise<string> {
  if (useBrowser) {
    console.log('Using Puppeteer to bypass WAF...');
    return fetchEurLexWithBrowser(celexId);
  }

  // Fallback to direct fetch (will fail with WAF)
  const url = `https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:${celexId}`;
  console.log(`Fetching: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; EU-Compliance-MCP/1.0; +https://github.com/Ansvar-Systems/EU_compliance_MCP)',
      'Accept': 'text/html',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

function parseRecitals(html: string): Recital[] {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const recitals: Recital[] = [];
  const allText = doc.body?.textContent || '';
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

  let inRecitalsSection = false;
  let currentRecital: { number: number; lines: string[] } | null = null;

  for (const line of lines) {
    // Detect start of recitals section
    if (line.match(/^Having regard to/i) || line.match(/^Whereas:/i)) {
      inRecitalsSection = true;
      continue;
    }

    // Detect end of recitals. EP+Council regulations use "HAVE ADOPTED",
    // Commission delegated/implementing acts use "HAS ADOPTED".
    if (line.match(/^(HAVE|HAS) ADOPTED/i) || line.match(/^Article\s+1$/i)) {
      inRecitalsSection = false;
      if (currentRecital && currentRecital.lines.length > 0) {
        recitals.push({
          recital_number: currentRecital.number,
          text: currentRecital.lines.join('\n\n'),
        });
        currentRecital = null;
      }
      break;
    }

    if (!inRecitalsSection) continue;

    // Match recital number: "(1)", "(123)", etc.
    const recitalMatch = line.match(/^\((\d+)\)/);
    if (recitalMatch) {
      // Save previous recital
      if (currentRecital && currentRecital.lines.length > 0) {
        recitals.push({
          recital_number: currentRecital.number,
          text: currentRecital.lines.join('\n\n'),
        });
      }

      // Start new recital
      currentRecital = {
        number: parseInt(recitalMatch[1]),
        lines: [],
      };

      // Add remaining text after number
      const textAfterNumber = line.substring(recitalMatch[0].length).trim();
      if (textAfterNumber) {
        currentRecital.lines.push(textAfterNumber);
      }
      continue;
    }

    // Add line to current recital
    if (currentRecital && line.length > 0) {
      currentRecital.lines.push(line);
    }
  }

  // Don't forget the last recital
  if (currentRecital && currentRecital.lines.length > 0) {
    recitals.push({
      recital_number: currentRecital.number,
      text: currentRecital.lines.join('\n\n'),
    });
  }

  return recitals;
}

function parseArticles(html: string, celexId: string): { articles: Article[]; definitions: Definition[] } {
  const dom = new JSDOM(html);
  const doc = dom.window.document;

  const articles: Article[] = [];
  const definitions: Definition[] = [];
  let currentChapter = '';

  // Get all text content and split by article markers
  const allText = doc.body?.textContent || '';
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l);

  let currentArticle: { number: string; title?: string; lines: string[] } | null = null;

  for (const line of lines) {
    // Stop at the trailing boilerplate that EUR-Lex appends after the final
    // article: signature block, footnotes with ELI references, and the page
    // template's ISSN line / JS snippet. Any of these markers reliably sits
    // after all article bodies.
    if (
      line.match(/^Done at\s+(Brussels|Strasbourg)/i) ||
      line.match(/^ELI:\s*https?:\/\//i) ||
      line.match(/^ISSN\s+\d{4}-\d{4}/)
    ) {
      break;
    }

    const articleStart = line.match(/^Article\s+(\d+[a-z]?)$/i);
    if (articleStart) {
      if (currentArticle && currentArticle.lines.length > 0) {
        articles.push({
          number: currentArticle.number,
          title: currentArticle.title,
          text: currentArticle.lines.join('\n\n'),
          chapter: currentChapter || undefined,
        });
      }
      currentArticle = { number: articleStart[1], lines: [] };
      continue;
    }

    const chapterStart = line.match(/^CHAPTER\s+([IVXLC]+)/i);
    if (chapterStart) {
      currentChapter = chapterStart[1];
      continue;
    }

    if (currentArticle) {
      // Check if this is a title line (short, no period at end)
      if (!currentArticle.title && currentArticle.lines.length === 0 && line.length < 100 && !line.endsWith('.')) {
        currentArticle.title = line;
      } else if (line.length > 0) {
        currentArticle.lines.push(line);
      }
    }
  }

  // Don't forget the last article
  if (currentArticle && currentArticle.lines.length > 0) {
    articles.push({
      number: currentArticle.number,
      title: currentArticle.title,
      text: currentArticle.lines.join('\n\n'),
      chapter: currentChapter || undefined,
    });
  }

  // Deduplicate articles - keep the one with the most content for each number
  const articleMap = new Map<string, Article>();
  for (const article of articles) {
    const existing = articleMap.get(article.number);
    if (!existing || article.text.length > existing.text.length) {
      articleMap.set(article.number, article);
    }
  }
  const deduplicatedArticles = Array.from(articleMap.values())
    .sort((a, b) => {
      // Extract numeric and letter parts (e.g., "5a" -> [5, "a"])
      const matchA = a.number.match(/^(\d+)([a-z]?)$/);
      const matchB = b.number.match(/^(\d+)([a-z]?)$/);
      if (!matchA || !matchB) return 0;
      
      const numA = parseInt(matchA[1]);
      const numB = parseInt(matchB[1]);
      
      // Sort by number first
      if (numA !== numB) return numA - numB;
      
      // Then by letter (empty string sorts before letters)
      return (matchA[2] || '').localeCompare(matchB[2] || '');
    });

  // Extract definitions from Article 4 (or similar definitions article)
  // Find definitions article from deduplicated list
  const defsArticle = deduplicatedArticles.find(a =>
    a.title?.toLowerCase().includes('definition')
  );

  if (defsArticle && defsArticle.text.includes('means')) {
    // Normalize text: collapse whitespace and normalize quotes
    const normalizedText = defsArticle.text
      .replace(/\s+/g, ' ')
      .replace(/[\u2018\u2019]/g, "'"); // Curly quotes to straight

    // Parse definitions by extracting content between consecutive numbered entries
    // This handles:
    // - Complex definitions with internal periods/semicolons
    // - 'term' or 'alternate' means... patterns (NIS2 Art 6)
    // - 'term1', 'term2' and 'term3' mean... patterns (CRA Art 3)
    // - 'term' of the something means... patterns (GDPR Art 4)
    // - mean, respectively... patterns (CRA Art 3)
    // - means: (a) ... patterns (complex definitions with sub-parts)
    const defRegex = /\((\d+)\)\s*'([^']+)'(?:[^(]*?)means?[,:;]?\s+(.+?)(?=\(\d+\)\s*'|$)/g;
    let defMatch;
    while ((defMatch = defRegex.exec(normalizedText)) !== null) {
      const term = defMatch[2].trim().toLowerCase();
      const definition = defMatch[3].trim();
      // Only add if we got meaningful content
      if (term.length > 0 && definition.length > 10) {
        definitions.push({
          term,
          definition,
          article: defsArticle.number,
        });
      }
    }
  }

  return { articles: deduplicatedArticles, definitions };
}

async function ingestRegulation(celexId: string, outputPath: string, useBrowser = false): Promise<void> {
  const metadata = REGULATION_METADATA[celexId];
  if (!metadata) {
    console.warn(`Unknown CELEX ID: ${celexId}. Using generic metadata.`);
  }

  const html = await fetchEurLexHtml(celexId, useBrowser);
  console.log(`Fetched ${html.length} bytes`);

  // Parse recitals BEFORE articles
  const recitals = parseRecitals(html);
  console.log(`Parsed ${recitals.length} recitals`);

  const { articles, definitions } = parseArticles(html, celexId);
  console.log(`Parsed ${articles.length} articles, ${definitions.length} definitions`);

  const annexes = parseAnnexes(html);
  console.log(`Parsed ${annexes.length} annexes`);

  // For AI Act specifically: rewrite Article 113 to contain only the transitional
  // provisions (paragraphs 1-4) and validate the annex extraction. The stray
  // ANNEX text that the article parser captured as part of Article 113 ends at
  // the first ANNEX I marker.
  if (metadata?.id === 'AI_ACT') {
    const art113 = articles.find((a) => a.number === '113');
    if (!art113) {
      throw new Error('AI Act: Article 113 not found in parsed articles');
    }
    const annexStart = art113.text.search(/\n?ANNEX\s+I\b/);
    if (annexStart > 0) {
      art113.text = art113.text.slice(0, annexStart).trim();
    }
    validateAiActAnnexes(annexes, art113.text);
  }

  // Merge annexes into the articles array so build-db.ts inserts them into
  // the articles table with their canonical 'Annex N' number.
  for (const annex of annexes) {
    articles.push({
      number: annex.number,
      title: annex.title,
      text: annex.text,
    });
  }

  if (articles.length === 0) {
    console.error('No articles found! The HTML structure may have changed.');
    console.log('Saving raw HTML for debugging...');
    writeFileSync(outputPath.replace('.json', '.html'), html);
    return;
  }

  const regulation: RegulationData = {
    id: metadata?.id || celexId,
    full_name: metadata?.full_name || `Regulation ${celexId}`,
    celex_id: celexId,
    effective_date: metadata?.effective_date,
    eur_lex_url: `https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:${celexId}`,
    articles,
    definitions,
    recitals,
  };

  writeFileSync(outputPath, JSON.stringify(regulation, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`Articles: ${articles.length}`);
  console.log(`Definitions: ${definitions.length}`);
  console.log(`Recitals: ${recitals.length}`);
}

// Main — only runs when executed directly, not when imported as a module
const isMain = process.argv[1] === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const useBrowser = args.includes('--browser');
  const [celexId, outputPath] = args.filter(arg => arg !== '--browser');

  if (!celexId || !outputPath) {
    console.log('Usage: npx tsx scripts/ingest-eurlex.ts <celex_id> <output_file> [--browser]');
    console.log('Example: npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json');
    console.log('Example (with browser): npx tsx scripts/ingest-eurlex.ts 32016R0679 data/seed/gdpr.json --browser');
    console.log('\nOptions:');
    console.log('  --browser    Use Puppeteer to bypass EUR-Lex WAF challenges');
    console.log('\nKnown CELEX IDs:');
    Object.entries(REGULATION_METADATA).forEach(([id, meta]) => {
      console.log(`  ${id} - ${meta.id} (${meta.full_name})`);
    });
    process.exit(1);
  }

  if (useBrowser) {
    console.log('Browser mode enabled - using Puppeteer to fetch content\n');
  }

  ingestRegulation(celexId, outputPath, useBrowser).catch(err => {
    console.error('Error:', err);
    process.exit(1);
  });
}
