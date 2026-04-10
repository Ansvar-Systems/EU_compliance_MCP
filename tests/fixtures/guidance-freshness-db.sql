-- Minimal fixture: one guidance_documents row per status value.
-- Run against a DB that already has the guidance schema applied.

INSERT OR REPLACE INTO guidance_documents (id, title, issuing_body, document_reference, date_published, related_regulation, url, pdf_url, status, metadata) VALUES
  ('F_PLANNED', 'Planned Guidelines Fixture', 'AI Office', 'REF_PLANNED', NULL, 'AI_ACT', 'https://example.test/planned', NULL, 'planned', '{"freshness_note":"awaiting publication"}'),
  ('F_DRAFT',   'Draft Code of Practice Fixture', 'AI Office', 'REF_DRAFT', '2026-03-05', 'AI_ACT', 'https://example.test/draft', NULL, 'draft', '{"freshness_note":"second draft published 2026-03-05"}'),
  ('F_PUBLISHED', 'Published Guidelines Fixture', 'AI Office', 'REF_PUBLISHED', '2025-02-04', 'AI_ACT', 'https://example.test/published', NULL, 'published', NULL),
  ('F_CURRENT', 'Current MDCG Fixture', 'MDCG', 'REF_CURRENT', '2024-01-01', 'MDR', 'https://example.test/current', NULL, 'current', NULL),
  ('F_SUPERSEDED', 'Superseded Fixture', 'AI Office', 'REF_SUPERSEDED', '2024-06-01', 'AI_ACT', 'https://example.test/superseded', NULL, 'superseded', '{"supersededBy":"F_PUBLISHED"}');
