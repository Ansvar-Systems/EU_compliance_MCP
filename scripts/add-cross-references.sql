-- Cross-references for EU Regulations MCP
-- Adds explicit article-to-article links for related requirements

-- ============================================================================
-- 1. INCIDENT MANAGEMENT & BREACH NOTIFICATION
-- ============================================================================

-- DORA Article 17: ICT-related incident management process
-- Links to: NIS2 Art 23 (incident reporting), GDPR Art 33 (breach notification)
UPDATE articles
SET cross_references = '["NIS2:23", "GDPR:33", "DORA:18", "DORA:19"]'
WHERE regulation = 'DORA' AND article_number = '17';

-- DORA Article 18: Classification of ICT-related incidents
-- Links to: DORA Art 17 (incident process), DORA Art 19 (reporting)
UPDATE articles
SET cross_references = '["DORA:17", "DORA:19", "NIS2:23"]'
WHERE regulation = 'DORA' AND article_number = '18';

-- DORA Article 19: Reporting of major ICT-related incidents
-- Links to: NIS2 Art 23 (reporting timelines), GDPR Art 33 (breach notification)
UPDATE articles
SET cross_references = '["NIS2:23", "GDPR:33", "DORA:17", "DORA:18"]'
WHERE regulation = 'DORA' AND article_number = '19';

-- NIS2 Article 23: Reporting obligations
-- Links to: DORA Art 19 (incident reporting), GDPR Art 33 (personal data breaches)
UPDATE articles
SET cross_references = '["DORA:19", "GDPR:33", "NIS2:21"]'
WHERE regulation = 'NIS2' AND article_number = '23';

-- GDPR Article 33: Notification of a personal data breach
-- Links to: GDPR Art 34 (notify subjects), DORA Art 19, NIS2 Art 23
UPDATE articles
SET cross_references = '["GDPR:34", "DORA:19", "NIS2:23"]'
WHERE regulation = 'GDPR' AND article_number = '33';

-- GDPR Article 34: Communication of breach to data subject
-- Links to: GDPR Art 33 (notify authority)
UPDATE articles
SET cross_references = '["GDPR:33", "DORA:19"]'
WHERE regulation = 'GDPR' AND article_number = '34';

-- ============================================================================
-- 2. RISK MANAGEMENT FRAMEWORKS
-- ============================================================================

-- DORA Article 6: ICT risk management framework
-- Links to: NIS2 Art 21 (cybersecurity risk management), DORA Art 8 (identification)
UPDATE articles
SET cross_references = '["NIS2:21", "DORA:8", "DORA:9", "DORA:11"]'
WHERE regulation = 'DORA' AND article_number = '6';

-- NIS2 Article 21: Cybersecurity risk-management measures
-- Links to: DORA Art 6 (ICT risk framework), NIS2 Art 23 (incident reporting)
UPDATE articles
SET cross_references = '["DORA:6", "NIS2:23", "CRA:10"]'
WHERE regulation = 'NIS2' AND article_number = '21';

-- GDPR Article 32: Security of processing
-- Links to: DORA Art 9 (protection), NIS2 Art 21 (risk management)
UPDATE articles
SET cross_references = '["GDPR:33", "DORA:9", "NIS2:21"]'
WHERE regulation = 'GDPR' AND article_number = '32';

-- ============================================================================
-- 3. THIRD-PARTY / SUPPLY CHAIN RISK
-- ============================================================================

-- DORA Article 28: General principles on ICT third-party risk
-- Links to: DORA Art 30 (contractual arrangements), NIS2 Art 21 (supply chain)
UPDATE articles
SET cross_references = '["DORA:30", "DORA:31", "NIS2:21"]'
WHERE regulation = 'DORA' AND article_number = '28';

-- DORA Article 30: Key contractual provisions
-- Links to: DORA Art 28 (general principles), DORA Art 31 (critical providers)
UPDATE articles
SET cross_references = '["DORA:28", "DORA:31", "GDPR:28"]'
WHERE regulation = 'DORA' AND article_number = '30';

-- GDPR Article 28: Processor obligations
-- Links to: DORA Art 30 (ICT third-party contracts), GDPR Art 32 (security)
UPDATE articles
SET cross_references = '["GDPR:32", "DORA:30", "GDPR:5"]'
WHERE regulation = 'GDPR' AND article_number = '28';

-- ============================================================================
-- 4. AI SYSTEMS & DATA PROTECTION
-- ============================================================================

-- AI Act Article 10: Data and data governance
-- Links to: GDPR Art 5 (data principles), AI Act Art 9 (risk management)
UPDATE articles
SET cross_references = '["GDPR:5", "GDPR:25", "AI_ACT:9"]'
WHERE regulation = 'AI_ACT' AND article_number = '10';

-- GDPR Article 22: Automated individual decision-making
-- Links to: AI Act Art 5 (prohibited practices), GDPR Art 13-14 (information)
UPDATE articles
SET cross_references = '["AI_ACT:5", "GDPR:13", "GDPR:14"]'
WHERE regulation = 'GDPR' AND article_number = '22';

-- ============================================================================
-- 5. IDENTITY & TRUST SERVICES
-- ============================================================================

-- eIDAS2 Article 19: Security requirements for trust service providers
-- Links to: GDPR Art 32 (security of processing), NIS2 Art 21 (risk management)
UPDATE articles
SET cross_references = '["GDPR:32", "NIS2:21", "EIDAS2:24"]'
WHERE regulation = 'EIDAS2' AND article_number = '19';

-- ============================================================================
-- 6. PRODUCT SECURITY (CRA, MDR, IVDR)
-- ============================================================================

-- CRA Article 10: Cybersecurity requirements
-- Links to: CRA Art 14 (vulnerability reporting), NIS2 Art 21 (risk management)
UPDATE articles
SET cross_references = '["CRA:14", "NIS2:21", "CRA:11"]'
WHERE regulation = 'CRA' AND article_number = '10';

-- CRA Article 14: Notification of exploited vulnerabilities
-- Links to: CRA Art 10 (security requirements), DORA Art 19 (incident reporting)
UPDATE articles
SET cross_references = '["CRA:10", "DORA:19", "NIS2:23"]'
WHERE regulation = 'CRA' AND article_number = '14';

-- MDR Article 87: Reporting of serious incidents
-- Links to: IVDR Art 82 (same for IVDs), GDPR Art 33 (if personal data involved)
UPDATE articles
SET cross_references = '["IVDR:82", "GDPR:33", "MDR:88"]'
WHERE regulation = 'MDR' AND article_number = '87';

-- IVDR Article 82: Reporting of serious incidents
-- Links to: MDR Art 87 (same for medical devices), GDPR Art 33
UPDATE articles
SET cross_references = '["MDR:87", "GDPR:33", "IVDR:83"]'
WHERE regulation = 'IVDR' AND article_number = '82';

-- ============================================================================
-- 7. HEALTHCARE DATA (EHDS)
-- ============================================================================

-- EHDS Article 44: Handling of serious incidents
-- Links to: GDPR Art 33 (breach notification), NIS2 Art 23 (incident reporting)
UPDATE articles
SET cross_references = '["GDPR:33", "NIS2:23", "MDR:87"]'
WHERE regulation = 'EHDS' AND article_number = '44';

-- ============================================================================
-- 8. FINANCIAL SERVICES (PSD2, MiCA, MiFID)
-- ============================================================================

-- PSD2 Article 96: Incident reporting
-- Links to: DORA Art 19 (major incidents), GDPR Art 33 (personal data breaches)
UPDATE articles
SET cross_references = '["DORA:19", "GDPR:33", "PSD2:95"]'
WHERE regulation = 'PSD2' AND article_number = '96';

-- MiCA Article 73: Incident reporting for crypto-asset service providers
-- Links to: DORA Art 19 (incident reporting), GDPR Art 33
UPDATE articles
SET cross_references = '["DORA:19", "GDPR:33", "MICA:72"]'
WHERE regulation = 'MICA' AND article_number = '73';

-- ============================================================================
-- 9. AUTOMOTIVE (UN R155/R156)
-- ============================================================================

-- UN_R155 Article 7: Cybersecurity Management System (CSMS)
-- Links to: CRA Art 10 (product cybersecurity), UN_R156 Art 7 (software updates)
UPDATE articles
SET cross_references = '["CRA:10", "UN_R156:7", "NIS2:21"]'
WHERE regulation = 'UN_R155' AND article_number = '7';

-- UN_R156 Article 7: Software Update Management System (SUMS)
-- Links to: UN_R155 Art 7 (CSMS), CRA Art 10 (security updates)
UPDATE articles
SET cross_references = '["UN_R155:7", "CRA:10", "CRA:11"]'
WHERE regulation = 'UN_R156' AND article_number = '7';

-- ============================================================================
-- 10. CRITICAL INFRASTRUCTURE
-- ============================================================================

-- CER Article 15: Incident notification
-- Links to: NIS2 Art 23 (incident reporting), DORA Art 19 (for financial entities)
UPDATE articles
SET cross_references = '["NIS2:23", "DORA:19", "CER:11"]'
WHERE regulation = 'CER' AND article_number = '15';

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- SELECT regulation, article_number, title, cross_references
-- FROM articles
-- WHERE cross_references IS NOT NULL
-- ORDER BY regulation, CAST(article_number AS INTEGER);
