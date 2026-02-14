import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import { createSqliteAdapter } from '../../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

const SCHEMA = `
-- Core regulation metadata
CREATE TABLE regulations (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  celex_id TEXT NOT NULL,
  effective_date TEXT,
  last_amended TEXT,
  eur_lex_url TEXT
);

-- Articles table
CREATE TABLE articles (
  rowid INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  article_number TEXT NOT NULL,
  title TEXT,
  text TEXT NOT NULL,
  chapter TEXT,
  recitals TEXT,
  cross_references TEXT,
  UNIQUE(regulation, article_number)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE articles_fts USING fts5(
  regulation,
  article_number,
  title,
  text,
  content='articles',
  content_rowid='rowid'
);

-- FTS5 triggers
CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
  INSERT INTO articles_fts(rowid, regulation, article_number, title, text)
  VALUES (new.rowid, new.regulation, new.article_number, new.title, new.text);
END;

-- Recitals table
CREATE TABLE recitals (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  recital_number INTEGER NOT NULL,
  text TEXT NOT NULL,
  related_articles TEXT,
  UNIQUE(regulation, recital_number)
);

-- FTS5 virtual table for recitals search
CREATE VIRTUAL TABLE recitals_fts USING fts5(
  regulation,
  recital_number,
  text,
  content='recitals',
  content_rowid='id'
);

-- FTS5 triggers for recitals
CREATE TRIGGER recitals_ai AFTER INSERT ON recitals BEGIN
  INSERT INTO recitals_fts(rowid, regulation, recital_number, text)
  VALUES (new.id, new.regulation, new.recital_number, new.text);
END;

-- Definitions
CREATE TABLE definitions (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  term TEXT NOT NULL,
  definition TEXT NOT NULL,
  article TEXT NOT NULL,
  UNIQUE(regulation, term)
);

-- Control mappings
CREATE TABLE control_mappings (
  id INTEGER PRIMARY KEY,
  framework TEXT NOT NULL DEFAULT 'ISO27001',
  control_id TEXT NOT NULL,
  control_name TEXT NOT NULL,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  articles TEXT NOT NULL,
  coverage TEXT CHECK(coverage IN ('full', 'partial', 'related')),
  notes TEXT
);

-- Applicability rules
CREATE TABLE applicability_rules (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  sector TEXT NOT NULL,
  subsector TEXT,
  applies INTEGER NOT NULL,
  confidence TEXT CHECK(confidence IN ('definite', 'likely', 'possible')),
  basis_article TEXT,
  notes TEXT
);

-- Source registry
CREATE TABLE source_registry (
  regulation TEXT PRIMARY KEY REFERENCES regulations(id),
  celex_id TEXT NOT NULL,
  eur_lex_version TEXT,
  last_fetched TEXT,
  articles_expected INTEGER,
  articles_parsed INTEGER,
  quality_status TEXT CHECK(quality_status IN ('complete', 'review', 'incomplete')),
  notes TEXT
);

-- Evidence requirements
CREATE TABLE evidence_requirements (
  id INTEGER PRIMARY KEY,
  regulation TEXT NOT NULL REFERENCES regulations(id),
  article TEXT NOT NULL,
  requirement_summary TEXT,
  evidence_type TEXT,
  artifact_name TEXT,
  description TEXT
);
`;

const SAMPLE_DATA = `
-- Sample regulations
INSERT INTO regulations (id, full_name, celex_id, effective_date) VALUES
  ('GDPR', 'General Data Protection Regulation', '32016R0679', '2018-05-25'),
  ('NIS2', 'Network and Information Security Directive 2', '32022L2555', '2024-10-17'),
  ('DORA', 'Digital Operational Resilience Act', '32022R2554', '2025-01-17');

-- Sample GDPR articles
INSERT INTO articles (regulation, article_number, title, text, chapter) VALUES
  ('GDPR', '1', 'Subject-matter and objectives', 'This Regulation lays down rules relating to the protection of natural persons with regard to the processing of personal data and rules relating to the free movement of personal data.', 'I'),
  ('GDPR', '4', 'Definitions', '''personal data'' means any information relating to an identified or identifiable natural person (''data subject''); an identifiable natural person is one who can be identified, directly or indirectly, in particular by reference to an identifier such as a name, an identification number, location data, an online identifier or to one or more factors specific to the physical, physiological, genetic, mental, economic, cultural or social identity of that natural person.', 'I'),
  ('GDPR', '5', 'Principles relating to processing of personal data', 'Personal data shall be processed lawfully, fairly and in a transparent manner in relation to the data subject. Personal data shall be collected for specified, explicit and legitimate purposes. Personal data shall be adequate, relevant and limited to what is necessary. Personal data shall be accurate and kept up to date.', 'II'),
  ('GDPR', '6', 'Lawfulness of processing', 'Processing shall be lawful only if and to the extent that at least one of the following applies: the data subject has given consent, processing is necessary for the performance of a contract, processing is necessary for compliance with a legal obligation.', 'II'),
  ('GDPR', '32', 'Security of processing', 'The controller and the processor shall implement appropriate technical and organisational measures to ensure a level of security appropriate to the risk, including encryption of personal data, the ability to ensure ongoing confidentiality, integrity, availability and resilience of processing systems.', 'IV'),
  ('GDPR', '33', 'Notification of a personal data breach', 'In the case of a personal data breach, the controller shall without undue delay and, where feasible, not later than 72 hours after having become aware of it, notify the personal data breach to the supervisory authority.', 'IV');

-- Sample NIS2 articles
INSERT INTO articles (regulation, article_number, title, text, chapter) VALUES
  ('NIS2', '1', 'Subject matter', 'This Directive lays down measures with a view to achieving a high common level of cybersecurity across the Union. This Directive establishes cybersecurity risk-management measures and reporting obligations for essential and important entities.', 'I'),
  ('NIS2', '21', 'Cybersecurity risk-management measures', 'Member States shall ensure that essential and important entities take appropriate and proportionate technical, operational and organisational measures to manage the risks posed to the security of network and information systems.', 'IV'),
  ('NIS2', '23', 'Reporting obligations', 'Member States shall ensure that essential and important entities notify, without undue delay, the CSIRT or competent authority of any incident that has a significant impact on the provision of their services. An early warning shall be submitted within 24 hours. An incident notification shall be submitted within 72 hours.', 'IV'),
  ('NIS2', '24', 'Use of European cybersecurity certification schemes', 'Member States may require essential and important entities to use particular ICT products, ICT services and ICT processes that are certified under European cybersecurity certification schemes.', 'IV');

-- Sample DORA articles
INSERT INTO articles (regulation, article_number, title, text, chapter) VALUES
  ('DORA', '1', 'Subject matter', 'This Regulation lays down uniform requirements concerning the security of network and information systems supporting the business processes of financial entities.', 'I'),
  ('DORA', '17', 'ICT-related incident management process', 'Financial entities shall define, establish and implement an ICT-related incident management process to detect, manage and notify ICT-related incidents. Financial entities shall record all ICT-related incidents and significant cyber threats.', 'III'),
  ('DORA', '19', 'Reporting of major ICT-related incidents', 'Financial entities shall report major ICT-related incidents to the relevant competent authority. The initial notification shall be made without undue delay and in any event within 4 hours from the moment the financial entity classifies the incident as major.', 'III'),
  ('DORA', '28', 'General principles', 'Financial entities shall manage ICT third-party risk as an integral component of ICT risk within their ICT risk management framework. Financial entities shall adopt and regularly review a strategy on ICT third-party risk.', 'V');

-- Sample recitals
INSERT INTO recitals (regulation, recital_number, text, related_articles) VALUES
  ('GDPR', 1, 'The protection of natural persons in relation to the processing of personal data is a fundamental right. Article 8(1) of the Charter of Fundamental Rights of the European Union and Article 16(1) of the Treaty on the Functioning of the European Union provide that everyone has the right to the protection of personal data concerning him or her.', '["1", "2"]'),
  ('GDPR', 83, 'In order to maintain security and to prevent processing in infringement of this Regulation, the controller or processor should evaluate the risks inherent in the processing and implement measures to mitigate those risks, such as encryption. Those measures should ensure an appropriate level of security, including confidentiality, taking into account the state of the art and the costs of implementation in relation to the risks and the nature of the personal data to be protected.', '["32"]'),
  ('NIS2', 1, 'The achievement of a high common level of cybersecurity across the Union is necessary to improve the functioning of the internal market and to protect individuals, legal persons and their rights, as well as Member States and the Union as a whole, against cyber threats.', '["1"]'),
  ('DORA', 1, 'Digital operational resilience is essential to ensure that financial entities can withstand, respond to and recover from all types of information and communication technology (ICT)-related disruptions and threats.', '["1"]');

-- Sample definitions
INSERT INTO definitions (regulation, term, definition, article) VALUES
  ('GDPR', 'personal data', 'any information relating to an identified or identifiable natural person', '4'),
  ('GDPR', 'processing', 'any operation performed on personal data, such as collection, recording, organisation, storage, adaptation, retrieval, consultation, use, disclosure, erasure or destruction', '4'),
  ('NIS2', 'incident', 'an event compromising the availability, authenticity, integrity or confidentiality of stored, transmitted or processed data or of the services offered by, or accessible via, network and information systems', '6'),
  ('DORA', 'ICT-related incident', 'a single event or a series of linked events unplanned by the financial entity that compromises the security of the network and information systems', '3');

-- Sample control mappings (ISO 27001:2022)
INSERT INTO control_mappings (framework, control_id, control_name, regulation, articles, coverage, notes) VALUES
  ('ISO27001', 'A.5.1', 'Policies for information security', 'GDPR', '["24", "32"]', 'partial', 'GDPR requires appropriate technical and organisational measures'),
  ('ISO27001', 'A.5.1', 'Policies for information security', 'NIS2', '["21"]', 'full', 'NIS2 explicitly requires security policies'),
  ('ISO27001', 'A.5.1', 'Policies for information security', 'DORA', '["9", "10"]', 'full', 'DORA Chapter II covers ICT risk management framework'),
  ('ISO27001', 'A.6.8', 'Information security event reporting', 'GDPR', '["33", "34"]', 'full', 'Data breach notification requirements'),
  ('ISO27001', 'A.6.8', 'Information security event reporting', 'NIS2', '["23"]', 'full', 'Incident reporting to CSIRT'),
  ('ISO27001', 'A.6.8', 'Information security event reporting', 'DORA', '["17", "19"]', 'full', 'ICT incident reporting requirements'),
  -- Sample NIST CSF mappings
  ('NIST_CSF', 'GV.PO-01', 'Cybersecurity policy', 'GDPR', '["24", "32"]', 'partial', 'GDPR requires appropriate policies'),
  ('NIST_CSF', 'GV.PO-01', 'Cybersecurity policy', 'NIS2', '["21"]', 'full', 'NIS2 explicitly requires security policies'),
  ('NIST_CSF', 'RS.MA-01', 'Incident response plan is executed', 'GDPR', '["33", "34"]', 'full', 'Breach notification requirements'),
  ('NIST_CSF', 'RS.MA-01', 'Incident response plan is executed', 'NIS2', '["23"]', 'full', 'Incident reporting to CSIRT');

-- Sample applicability rules
INSERT INTO applicability_rules (regulation, sector, subsector, applies, confidence, basis_article, notes) VALUES
  ('GDPR', 'financial', NULL, 1, 'definite', '2', 'Applies to all sectors processing personal data'),
  ('GDPR', 'healthcare', NULL, 1, 'definite', '2', 'Applies to all sectors processing personal data'),
  ('GDPR', 'manufacturing', NULL, 1, 'definite', '2', 'Applies to all sectors processing personal data'),
  ('NIS2', 'financial', 'bank', 1, 'definite', '2', 'Banks are essential entities'),
  ('NIS2', 'energy', NULL, 1, 'definite', '2', 'Energy sector is essential'),
  ('NIS2', 'healthcare', NULL, 1, 'definite', '2', 'Healthcare providers are essential entities'),
  ('NIS2', 'digital_infrastructure', NULL, 1, 'definite', '2', 'DNS, TLD, cloud providers are essential'),
  ('DORA', 'financial', 'bank', 1, 'definite', '2', 'Credit institutions in scope'),
  ('DORA', 'financial', 'insurance', 1, 'definite', '2', 'Insurance undertakings in scope'),
  ('DORA', 'financial', 'investment', 1, 'definite', '2', 'Investment firms in scope');

-- Sample source registry entries
INSERT INTO source_registry (regulation, celex_id, eur_lex_version, last_fetched, articles_expected, articles_parsed, quality_status) VALUES
  ('GDPR', '32016R0679', '2016-05-04', '2026-02-14T06:00:00Z', 6, 6, 'complete'),
  ('NIS2', '32022L2555', '2022-12-27', '2026-02-14T06:00:00Z', 4, 4, 'complete'),
  ('DORA', '32022R2554', '2022-12-27', '2026-02-14T06:00:00Z', 4, 4, 'complete');

-- Sample evidence requirements
INSERT INTO evidence_requirements (regulation, article, requirement_summary, evidence_type, artifact_name, description) VALUES
  ('GDPR', '32', 'Security of processing', 'policy', 'Information Security Policy', 'Document describing technical and organisational measures'),
  ('GDPR', '33', 'Breach notification process', 'procedure', 'Breach Notification Procedure', 'Process for notifying supervisory authority within 72 hours'),
  ('DORA', '17', 'Incident management', 'procedure', 'ICT Incident Management Process', 'Documented process for detecting, managing and notifying ICT incidents');
`;

export function createTestDatabase(): DatabaseAdapter {
  // Create in-memory database for tests
  const sqliteDb = new Database(':memory:');

  // Enable foreign keys
  sqliteDb.pragma('foreign_keys = ON');

  // Create schema and insert sample data
  sqliteDb.exec(SCHEMA);
  sqliteDb.exec(SAMPLE_DATA);

  // Wrap in adapter
  return createSqliteAdapter(sqliteDb);
}

export async function closeTestDatabase(db: DatabaseAdapter): Promise<void> {
  await db.close();
}
