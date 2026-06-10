#!/usr/bin/env npx tsx

/**
 * Build the regulations.db SQLite database from seed JSON files.
 *
 * As of Phase 5 of the chassis migration (2026-05-26), this produces a
 * chassis-conformant SQLite DB that the @ansvar/mcp-base@>=0.1.27 chassis
 * serves directly. Schema reference:
 *   - Chassis core: provisions + content + content_fts + db_metadata
 *   - Chassis EU: eu_basis (table required because jurisdiction=EU triggers
 *     the chassis's auto-registration of get_eu_basis; populated empty for
 *     the EU MCP since EU primary law has no "implementing" EU basis)
 *   - Chassis opt-ins (manifest flags): recitals + recitals_fts (single-
 *     column over text per mcp-base v0.1.23+ contract), definitions
 *     (term/source/definition shape), guidance_documents + guidance_sections
 *     + guidance_sections_fts, provision_versions
 *   - EU-local extension tables (served by extensionHandlers):
 *     applicability_rules, control_mappings, evidence_requirements
 *
 * Canonical_ref convention: "{regulation_id}:art_{article_number}" for
 * articles, "{regulation_id}:annex_{annex_ref}" for annexes. The chassis
 * `search` and `get_provision` tools dispatch on this prefix.
 *
 * Run with: npm run build:db
 */

import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync, unlinkSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const SEED_DIR = process.env.SEED_DIR ?? join(DATA_DIR, 'seed');
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'regulations.db');

const SCHEMA_STATEMENTS: string[] = [
  // Chassis core (per mcps/_shared/translator-base.ts CHASSIS_CORE_SCHEMA)
  `CREATE TABLE provisions (
    id             INTEGER PRIMARY KEY,
    canonical_ref  TEXT NOT NULL,
    body           TEXT NOT NULL,
    is_substantive INTEGER DEFAULT 1,
    source_url     TEXT
  )`,
  `CREATE UNIQUE INDEX idx_provisions_canonical ON provisions(canonical_ref)`,
  // source_full_name + effective_date follow the chassis CitationBuilder
  // content-column convention (mcp-base v1.0.2+): columns with these exact
  // names are PRAGMA-probed and emitted as _citation.source_full_name /
  // .effective_date on every served row — the two fields the gateway cannot
  // derive from a canonical_ref.
  `CREATE TABLE content (
    id               INTEGER PRIMARY KEY,
    source_url       TEXT NOT NULL,
    license_code     TEXT,
    source_full_name TEXT,
    effective_date   TEXT
  )`,
  `CREATE VIRTUAL TABLE content_fts USING fts5(
    body,
    content='provisions',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  `CREATE TABLE db_metadata (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  // Chassis EU (required because jurisdiction=EU triggers auto-register)
  `CREATE TABLE eu_basis (
    id               INTEGER PRIMARY KEY,
    provision_id     INTEGER NOT NULL,
    celex            TEXT NOT NULL,
    reference_type   TEXT,
    alignment_status TEXT,
    in_force_from    TEXT,
    in_force_to      TEXT,
    FOREIGN KEY (provision_id) REFERENCES provisions(id)
  )`,
  `CREATE INDEX idx_eu_basis_provision ON eu_basis(provision_id)`,
  `CREATE INDEX idx_eu_basis_celex ON eu_basis(celex)`,
  // Chassis opt-in: recitals (mcp-base v0.1.23+). Single-column recitals_fts
  // over text per mcp-base v0.1.27 contract. source_url is the per-recital
  // ELI URL with #rct_N anchor (mcp-base v1.1.1 reads the column directly —
  // the chassis's document-keyed content join can't work against our
  // per-provision content table; issue #71).
  `CREATE TABLE recitals (
    id               INTEGER PRIMARY KEY,
    regulation       TEXT NOT NULL,
    recital_number   INTEGER NOT NULL,
    text             TEXT NOT NULL,
    related_articles TEXT,
    source_url       TEXT,
    UNIQUE(regulation, recital_number)
  )`,
  `CREATE VIRTUAL TABLE recitals_fts USING fts5(
    text,
    content='recitals',
    content_rowid='id',
    tokenize='unicode61 remove_diacritics 2'
  )`,
  // Chassis opt-in: definitions (mcp-base v0.1.19+).
  `CREATE TABLE definitions (
    id          INTEGER PRIMARY KEY,
    term        TEXT NOT NULL,
    source      TEXT NOT NULL,
    definition  TEXT NOT NULL,
    article     TEXT,
    UNIQUE(source, term)
  )`,
  `CREATE INDEX idx_definitions_source ON definitions(source)`,
  // Chassis opt-in: guidance (mcp-base v0.1.17+).
  `CREATE TABLE guidance_documents (
    id                  TEXT PRIMARY KEY,
    title               TEXT NOT NULL,
    issuing_body        TEXT NOT NULL,
    document_reference  TEXT,
    date_published      TEXT,
    date_revised        TEXT,
    related_regulation  TEXT,
    url                 TEXT,
    pdf_url             TEXT,
    status              TEXT DEFAULT 'current',
    metadata            TEXT
  )`,
  `CREATE TABLE guidance_sections (
    id              INTEGER PRIMARY KEY,
    document_id     TEXT NOT NULL REFERENCES guidance_documents(id),
    section_number  TEXT NOT NULL,
    title           TEXT NOT NULL,
    content         TEXT NOT NULL,
    parent_section  TEXT,
    metadata        TEXT,
    UNIQUE(document_id, section_number)
  )`,
  `CREATE VIRTUAL TABLE guidance_sections_fts USING fts5(
    document_id,
    section_number,
    title,
    content,
    content='guidance_sections',
    content_rowid='id',
    tokenize='porter unicode61'
  )`,
  `CREATE TRIGGER guidance_sections_ai AFTER INSERT ON guidance_sections BEGIN
    INSERT INTO guidance_sections_fts(rowid, document_id, section_number, title, content)
    VALUES (new.id, new.document_id, new.section_number, new.title, new.content);
  END`,
  `CREATE INDEX idx_gd_date ON guidance_documents(date_published DESC)`,
  // Chassis opt-in: provision_versions (mcp-base v0.1.18+). version_label
  // matches the chassis canonical schema (get_provision_history surfaces it;
  // older builds without the column made that tool error on every call —
  // issue #70, tolerated since mcp-base v1.1.1 but kept for parity).
  `CREATE TABLE provision_versions (
    id                  INTEGER PRIMARY KEY,
    canonical_ref       TEXT NOT NULL,
    version_label       TEXT,
    effective_date      TEXT,
    superseded_date     TEXT,
    body_text           TEXT,
    change_summary      TEXT,
    diff_from_previous  TEXT,
    source_url          TEXT,
    scraped_at          TEXT,
    metadata            TEXT
  )`,
  `CREATE INDEX idx_pv_canonical ON provision_versions(canonical_ref)`,
  `CREATE INDEX idx_pv_effective ON provision_versions(effective_date)`,
  // EU-local: tables consumed by the ExtensionHandlers.
  `CREATE TABLE applicability_rules (
    id            INTEGER PRIMARY KEY,
    regulation    TEXT NOT NULL,
    sector        TEXT NOT NULL,
    subsector     TEXT,
    applies       INTEGER NOT NULL,
    confidence    TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),
    basis_article TEXT,
    notes         TEXT
  )`,
  `CREATE INDEX idx_applicability_sector ON applicability_rules(sector)`,
  `CREATE TABLE control_mappings (
    id            INTEGER PRIMARY KEY,
    framework     TEXT NOT NULL DEFAULT 'ISO27001',
    control_id    TEXT NOT NULL,
    control_name  TEXT NOT NULL,
    regulation    TEXT NOT NULL,
    articles      TEXT NOT NULL,
    coverage      TEXT CHECK(coverage IN ('full', 'partial', 'related')),
    notes         TEXT
  )`,
  `CREATE INDEX idx_mappings_regulation ON control_mappings(regulation)`,
  `CREATE INDEX idx_mappings_framework ON control_mappings(framework)`,
  `CREATE TABLE evidence_requirements (
    id                  INTEGER PRIMARY KEY,
    regulation          TEXT NOT NULL,
    article             TEXT NOT NULL,
    requirement_summary TEXT NOT NULL,
    evidence_type       TEXT NOT NULL CHECK(evidence_type IN ('document', 'log', 'test_result', 'certification', 'policy', 'procedure')),
    artifact_name       TEXT NOT NULL,
    artifact_example    TEXT,
    description         TEXT,
    retention_period    TEXT,
    auditor_questions   TEXT,
    maturity_levels     TEXT,
    cross_references    TEXT
  )`,
  `CREATE INDEX idx_evidence_regulation ON evidence_requirements(regulation)`,
  `CREATE TABLE source_registry (
    regulation         TEXT PRIMARY KEY,
    celex_id           TEXT NOT NULL,
    eur_lex_version    TEXT,
    last_fetched       TEXT,
    articles_expected  INTEGER,
    articles_parsed    INTEGER,
    quality_status     TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),
    notes              TEXT
  )`,
];

interface RegulationSeed {
  id: string;
  full_name: string;
  celex_id: string;
  effective_date?: string;
  eur_lex_url?: string;
  articles: Array<{
    number: string;
    title?: string;
    text: string;
    chapter?: string;
    recitals?: string[];
    cross_references?: string[];
  }>;
  annexes?: Array<{
    number: string;
    title: string;
    text: string;
  }>;
  definitions?: Array<{
    term: string;
    definition: string;
    article: string;
  }>;
  recitals?: Array<{
    recital_number: number;
    text: string;
    related_articles?: string[] | number[];
  }>;
}

const ELI_BASE = 'https://eur-lex.europa.eu/eli';
const CELEX_TO_ELI_TYPE: Record<string, string> = { R: 'reg', L: 'dir', D: 'dec' };

function celexToEliBase(celexId: string | null | undefined): string | null {
  if (!celexId) return null;
  const match = celexId.match(/^3(\d{4})([A-Z])(\d+)$/);
  if (!match) return null;
  const [, year, type, num] = match;
  const eliType = CELEX_TO_ELI_TYPE[type];
  if (!eliType) return null;
  const numClean = String(parseInt(num, 10));
  return `${ELI_BASE}/${eliType}/${year}/${numClean}/oj`;
}

function buildProvisionSourceUrl(
  celexId: string,
  fallbackUrl: string,
  ref: string,
): string {
  const eli = celexToEliBase(celexId);
  if (!eli) return fallbackUrl;
  if (ref.startsWith('art_')) {
    return `${eli}#${ref}`;
  }
  if (ref.startsWith('annex_')) {
    return `${eli}#anx_${ref.slice('annex_'.length)}`;
  }
  if (ref.startsWith('rct_')) {
    return `${eli}#${ref}`;
  }
  return eli;
}

function buildDatabase() {
  console.log('Building EU regulations chassis-shape database...');

  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (existsSync(DB_PATH)) {
    console.log('Removing existing database...');
    unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = DELETE');
  db.pragma('foreign_keys = OFF');

  console.log('Creating chassis schema...');
  for (const stmt of SCHEMA_STATEMENTS) {
    db.prepare(stmt).run();
  }

  let nextProvisionId = 1;
  const insertContent = db.prepare(
    'INSERT INTO content (id, source_url, license_code, source_full_name, effective_date) VALUES (?, ?, ?, ?, ?)',
  );
  const insertProvision = db.prepare(
    'INSERT INTO provisions (id, canonical_ref, body, is_substantive, source_url) VALUES (?, ?, ?, ?, ?)',
  );
  const insertFts = db.prepare('INSERT INTO content_fts (rowid, body) VALUES (?, ?)');
  const insertRecital = db.prepare(
    'INSERT OR IGNORE INTO recitals (regulation, recital_number, text, related_articles, source_url) VALUES (?, ?, ?, ?, ?)',
  );
  const insertDefinition = db.prepare(
    'INSERT OR IGNORE INTO definitions (term, source, definition, article) VALUES (?, ?, ?, ?)',
  );
  const insertSourceRegistry = db.prepare(`
    INSERT INTO source_registry (regulation, celex_id, eur_lex_version, last_fetched, articles_expected, articles_parsed, quality_status)
    VALUES (?, ?, ?, ?, ?, ?, 'complete')
  `);

  const stats = {
    regulations: 0,
    provisions: 0,
    recitals: 0,
    definitions: 0,
    annexes: 0,
  };

  if (!existsSync(SEED_DIR)) {
    console.log('No seed directory found. Database created with empty tables.');
    console.log(`Create seed files in: ${SEED_DIR}`);
    db.close();
    return;
  }

  const seedFiles = readdirSync(SEED_DIR)
    .filter((f: string) => f.endsWith('.json'))
    .filter((f) => !f.startsWith('mappings'));

  const tx = db.transaction(() => {
    for (const file of seedFiles) {
      const raw = readFileSync(join(SEED_DIR, file), 'utf-8');
      const reg: RegulationSeed = JSON.parse(raw);
      stats.regulations++;
      const baseUrl = reg.eur_lex_url ?? '';

      // Articles -> provisions.
      for (const article of reg.articles) {
        const ref = `${reg.id}:art_${article.number}`;
        const body = article.title ? `${article.title}\n\n${article.text}` : article.text;
        const provisionSourceUrl = buildProvisionSourceUrl(reg.celex_id, baseUrl, `art_${article.number}`);
        const id = nextProvisionId++;
        insertContent.run(id, provisionSourceUrl, 'CC-BY-4.0', reg.full_name ?? null, reg.effective_date ?? null);
        insertProvision.run(id, ref, body, 1, provisionSourceUrl);
        insertFts.run(id, body);
        stats.provisions++;
      }

      // Annexes -> provisions.
      for (const annex of reg.annexes ?? []) {
        const annexNum = annex.number.replace(/^Annex\s+/i, '').replace(/\s+/g, '_');
        const ref = `${reg.id}:annex_${annexNum}`;
        const body = `${annex.title}\n\n${annex.text}`;
        const provisionSourceUrl = buildProvisionSourceUrl(reg.celex_id, baseUrl, `annex_${annexNum}`);
        const id = nextProvisionId++;
        insertContent.run(id, provisionSourceUrl, 'CC-BY-4.0', reg.full_name ?? null, reg.effective_date ?? null);
        insertProvision.run(id, ref, body, 1, provisionSourceUrl);
        insertFts.run(id, body);
        stats.provisions++;
        stats.annexes++;
      }

      // Title :meta row (mcp-base v0.1.36 title-boost): one {id}:meta provision
      // whose body is the regulation's name, so a query for the regulation by
      // name ("Cyber Resilience Act", "Digital Operational Resilience Act")
      // surfaces the regulation itself instead of scattered articles of other
      // regulations that merely mention the phrase. The `(id)` suffix keeps the
      // acronym ("DORA") searchable.
      {
        const metaRef = `${reg.id}:meta`;
        const metaBody = `${reg.full_name} (${reg.id})`;
        const metaUrl = buildProvisionSourceUrl(reg.celex_id, baseUrl, 'meta');
        const mId = nextProvisionId++;
        insertContent.run(mId, metaUrl, 'CC-BY-4.0', reg.full_name ?? null, reg.effective_date ?? null);
        insertProvision.run(mId, metaRef, metaBody, 1, metaUrl);
        insertFts.run(mId, metaBody);
        stats.provisions++;
      }

      // Recitals. source_url = ELI base + #rct_N anchor; falls back to the
      // regulation page URL for CELEX schemes without an ELI mapping.
      for (const r of reg.recitals ?? []) {
        insertRecital.run(
          reg.id,
          r.recital_number,
          r.text,
          r.related_articles ? JSON.stringify(r.related_articles) : null,
          buildProvisionSourceUrl(reg.celex_id, baseUrl, `rct_${r.recital_number}`) || null,
        );
        stats.recitals++;
      }

      // Definitions.
      for (const def of reg.definitions ?? []) {
        insertDefinition.run(def.term, reg.id, def.definition, def.article);
        stats.definitions++;
      }

      const now = new Date().toISOString();
      const eurLexVersion = reg.effective_date ?? now.split('T')[0];
      insertSourceRegistry.run(
        reg.id,
        reg.celex_id,
        eurLexVersion,
        now,
        reg.articles.length,
        reg.articles.length,
      );

      console.log(
        `  ${reg.id}: ${reg.articles.length} articles, ${(reg.annexes ?? []).length} annexes, ` +
          `${(reg.recitals ?? []).length} recitals, ${(reg.definitions ?? []).length} definitions`,
      );
    }
  });
  tx();

  // Build the recitals_fts inverted index. recitals_fts is an EXTERNAL-CONTENT
  // FTS5 table (content='recitals'): row reads proxy the recitals table, so
  // SELECT/COUNT look populated even when the index was never built — but
  // MATCH silently returns nothing. That exact trap shipped in the 5.A
  // migration and left search_recitals dead in prod until 2026-06-10. The
  // 'rebuild' special command re-derives the whole index from the content
  // table. (content_fts and guidance_sections_fts are unaffected: content_fts
  // rows are inserted explicitly per provision; guidance has an AFTER INSERT
  // trigger.)
  db.prepare(`INSERT INTO recitals_fts(recitals_fts) VALUES('rebuild')`).run();
  const recitalMatches = db
    .prepare(`SELECT COUNT(*) AS n FROM recitals_fts WHERE recitals_fts MATCH 'regulation'`)
    .get() as { n: number };
  if (stats.recitals > 0 && recitalMatches.n === 0) {
    throw new Error('recitals_fts rebuild produced an empty index — refusing to ship a dead search_recitals');
  }
  console.log(`  recitals_fts index rebuilt (${recitalMatches.n} matches for smoke term)`);

  // Control mappings.
  const mappingsDir = join(SEED_DIR, 'mappings');
  if (existsSync(mappingsDir)) {
    const insertMapping = db.prepare(`
      INSERT INTO control_mappings (framework, control_id, control_name, regulation, articles, coverage, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let total = 0;
    const mappingTx = db.transaction(() => {
      for (const file of readdirSync(mappingsDir).filter((f) => f.endsWith('.json'))) {
        const raw = readFileSync(join(mappingsDir, file), 'utf-8');
        const mappings = JSON.parse(raw);
        const framework = file.startsWith('nist-csf-') ? 'NIST_CSF' : 'ISO27001';
        for (const m of mappings) {
          insertMapping.run(
            framework,
            m.control_id,
            m.control_name,
            m.regulation,
            JSON.stringify(m.articles),
            m.coverage,
            m.notes ?? null,
          );
          total++;
        }
      }
    });
    mappingTx();
    console.log(`  Loaded ${total} control mappings`);
  }

  // Applicability rules.
  const applicabilityDir = join(SEED_DIR, 'applicability');
  if (existsSync(applicabilityDir)) {
    const insertApp = db.prepare(`
      INSERT INTO applicability_rules (regulation, sector, subsector, applies, confidence, basis_article, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    let total = 0;
    const appTx = db.transaction(() => {
      for (const file of readdirSync(applicabilityDir).filter((f) => f.endsWith('.json'))) {
        const raw = readFileSync(join(applicabilityDir, file), 'utf-8');
        const rules = JSON.parse(raw);
        for (const r of rules) {
          insertApp.run(
            r.regulation,
            r.sector,
            r.subsector ?? null,
            r.applies ? 1 : 0,
            r.confidence,
            r.basis_article ?? null,
            r.notes ?? null,
          );
          total++;
        }
      }
    });
    appTx();
    console.log(`  Loaded ${total} applicability rules`);
  }

  // Evidence requirements.
  const evidenceDir = join(SEED_DIR, 'evidence');
  if (existsSync(evidenceDir)) {
    const insertEvidence = db.prepare(`
      INSERT INTO evidence_requirements
        (regulation, article, requirement_summary, evidence_type, artifact_name,
         artifact_example, description, retention_period, auditor_questions,
         maturity_levels, cross_references)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let total = 0;
    const evidenceTx = db.transaction(() => {
      for (const file of readdirSync(evidenceDir).filter((f) => f.endsWith('.json'))) {
        const raw = readFileSync(join(evidenceDir, file), 'utf-8');
        const reqs = JSON.parse(raw);
        for (const req of reqs) {
          insertEvidence.run(
            req.regulation,
            req.article,
            req.requirement_summary,
            req.evidence_type,
            req.artifact_name,
            req.artifact_example ?? null,
            req.description ?? null,
            req.retention_period ?? null,
            req.auditor_questions ? JSON.stringify(req.auditor_questions) : null,
            req.maturity_levels ? JSON.stringify(req.maturity_levels) : null,
            req.cross_references ? JSON.stringify(req.cross_references) : null,
          );
          total++;
        }
      }
    });
    evidenceTx();
    console.log(`  Loaded ${total} evidence requirements`);
  }

  // Guidance documents + sections.
  const guidanceDir = join(SEED_DIR, 'guidance');
  if (existsSync(guidanceDir)) {
    const insertGuidanceDoc = db.prepare(`
      INSERT INTO guidance_documents
        (id, title, issuing_body, document_reference, date_published,
         related_regulation, url, pdf_url, status, metadata)
      VALUES (@id, @title, @issuing_body, @document_reference, @date_published,
              @related_regulation, @url, @pdf_url, @status, @metadata)
    `);
    const insertGuidanceSection = db.prepare(`
      INSERT INTO guidance_sections
        (document_id, section_number, title, content, parent_section)
      VALUES (@document_id, @section_number, @title, @content, @parent_section)
    `);
    let totalDocs = 0;
    let totalSections = 0;
    const guidanceTx = db.transaction(() => {
      for (const file of readdirSync(guidanceDir).filter((f) => f.endsWith('.json'))) {
        const raw = readFileSync(join(guidanceDir, file), 'utf-8');
        const seed = JSON.parse(raw);
        insertGuidanceDoc.run({
          id: seed.id,
          title: seed.title,
          issuing_body: seed.issuing_body,
          document_reference: seed.document_reference ?? null,
          date_published: seed.date_published ?? null,
          related_regulation: seed.related_regulation ?? null,
          url: seed.url ?? null,
          pdf_url: seed.pdf_url ?? null,
          status: seed.status ?? 'current',
          metadata: seed.metadata ? JSON.stringify(seed.metadata) : null,
        });
        totalDocs++;
        for (const sec of seed.sections ?? []) {
          insertGuidanceSection.run({
            document_id: seed.id,
            section_number: sec.section_number,
            title: sec.title,
            content: sec.content,
            parent_section: sec.parent_section ?? null,
          });
          totalSections++;
        }
      }
    });
    guidanceTx();
    console.log(`  Loaded ${totalDocs} guidance documents with ${totalSections} sections`);
  }

  // db_metadata.
  const insertMeta = db.prepare('INSERT INTO db_metadata (key, value) VALUES (?, ?)');
  const now = new Date().toISOString();
  insertMeta.run('schema_version', '3-chassis');
  insertMeta.run('tier', 'full');
  insertMeta.run('jurisdiction', 'EU');
  insertMeta.run('built_at', now);
  insertMeta.run('builder', 'scripts/build-db.ts (chassis migration Phase 5)');
  insertMeta.run('chassis_compatible_min_version', '0.1.27');
  insertMeta.run('regulations_count', String(stats.regulations));
  insertMeta.run('provisions_count', String(stats.provisions));
  insertMeta.run('annexes_count', String(stats.annexes));
  insertMeta.run('recitals_count', String(stats.recitals));
  insertMeta.run('definitions_count', String(stats.definitions));

  console.log(`\nChassis DB built — schema_version=3-chassis, jurisdiction=EU`);
  console.log(
    `Totals: ${stats.regulations} regulations, ${stats.provisions} provisions ` +
      `(${stats.annexes} annexes), ${stats.recitals} recitals, ${stats.definitions} definitions`,
  );

  db.close();
  console.log(`\nDatabase created at: ${DB_PATH}`);
}

buildDatabase();
