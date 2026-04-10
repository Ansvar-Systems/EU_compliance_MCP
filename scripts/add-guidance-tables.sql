-- Guidance documents (non-binding, issued by advisory groups or the European Commission).
-- Structurally different from regulations: section-based, not article-based.
--
-- status vocabulary (free-form TEXT column, no CHECK constraint):
--   planned    - announced but no public draft yet
--   draft      - public draft available (e.g. Commission second-draft code of practice)
--   published  - final version, in force
--   current    - legacy synonym of 'published' (kept for MDCG ingestion backwards compat)
--   superseded - replaced by a newer version; link via metadata.supersededBy

CREATE TABLE IF NOT EXISTS guidance_documents (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  issuing_body TEXT NOT NULL,
  document_reference TEXT,
  date_published TEXT,
  date_revised TEXT,
  related_regulation TEXT,
  url TEXT,
  pdf_url TEXT,
  status TEXT DEFAULT 'current',
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS guidance_sections (
  rowid INTEGER PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES guidance_documents(id),
  section_number TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  parent_section TEXT,
  metadata TEXT,
  UNIQUE(document_id, section_number)
);

CREATE VIRTUAL TABLE IF NOT EXISTS guidance_sections_fts USING fts5(
  document_id,
  section_number,
  title,
  content,
  content='guidance_sections',
  content_rowid='rowid',
  tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS guidance_sections_ai AFTER INSERT ON guidance_sections BEGIN
  INSERT INTO guidance_sections_fts(rowid, document_id, section_number, title, content)
  VALUES (new.rowid, new.document_id, new.section_number, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS guidance_sections_ad AFTER DELETE ON guidance_sections BEGIN
  INSERT INTO guidance_sections_fts(guidance_sections_fts, rowid, document_id, section_number, title, content)
  VALUES ('delete', old.rowid, old.document_id, old.section_number, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS guidance_sections_au AFTER UPDATE ON guidance_sections BEGIN
  INSERT INTO guidance_sections_fts(guidance_sections_fts, rowid, document_id, section_number, title, content)
  VALUES ('delete', old.rowid, old.document_id, old.section_number, old.title, old.content);
  INSERT INTO guidance_sections_fts(rowid, document_id, section_number, title, content)
  VALUES (new.rowid, new.document_id, new.section_number, new.title, new.content);
END;

CREATE INDEX IF NOT EXISTS idx_gd_date ON guidance_documents(date_published DESC);
