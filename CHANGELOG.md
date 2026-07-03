# Changelog

All notable changes to the EU Regulations MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

**EUDR + CSRD refreshed to the in-force amended text (accuracy fix — both seeds served repealed law)**
- `eudr.json` re-ingested from consolidated `02023R1115-20251226` (base act as amended by Reg (EU) 2024/3234 and Reg (EU) 2025/2650): application dates now 30 Dec 2026 / 30 Jun 2027 (the seed served the repealed 30 Dec 2024 / 30 Jun 2025), Art 4(8)-(10) deleted, new Art 4a simplified regime + Annex III, Art 5 recast (downstream-operator category; traders submit no due-diligence statement), 1 %/3 %/9 % minimum check rates, 4 % Union-wide-turnover penalty floor, Annex I "printed books" line removed. Base-act recitals preserved (consolidations omit the preamble).
- `csrd.json` re-ingested from consolidated `02022L2464-20260318` (as amended by Dir (EU) 2025/794 "stop-the-clock" and Dir (EU) 2026/470 Omnibus I): Art 5(2) now carries the wave-1 FY2024-FY2026 time limit and the >1 000-employee + EUR 450m net-turnover scope from FY2027.
- Applicability rules: CSRD listed-SME rule flipped to not-applicable (Omnibus I removed listed SMEs from mandatory scope; voluntary VSME reporting per Recommendation (EU) 2025/1710); CSRD sector notes updated to the new thresholds; EUDR trader note reflects the 2025/2650 no-DDS trader regime.
- `ingest-eurlex.ts` consolidated-version support: strips EUR-Lex consolidation markers, preserves base-act recitals when the consolidation omits the preamble, re-attaches CSRD's quote-inserted articles into Articles 1/3 (so `art_40a` cannot resolve to a 2013/34/EU insertion mis-addressed as a CSRD provision), and truncates the final article at the closing formula (annex/footnote/page-script bleed).
- `build-db.ts` `celexToEliBase`: consolidated CELEX now maps to the ELI point-in-time URL (e.g. `eli/reg/2023/1115/2025-12-26#art_4a`, anchors verified live) so provision citations point at the amended text; also upgrades eIDAS2 citation URLs from the un-anchored TXT fallback.
- Deliberately NOT applied (not yet law): the draft delegated act amending EUDR Annex I product scope (feedback closed 2026-06-01, no CELEX yet — recheck ~2026-08-01) and the revised-ESRS delegated act (Commission-adopted 2026-07-03, still in EP/Council scrutiny, no OJ publication).

**Adopt mcp-base v1.5.0 — guidance citation enrichment (closes EU_compliance_MCP #80)**
- Dockerfile base pin `v1.3.1-alpine` → `v1.5.0-alpine`; manifest `mcp_base_min_version` `1.2.1` → `1.5.0`.
- v1.5.0 wires the guidance tool family (`search_guidance` / `get_guidance_section` / `list_guidance`) through the shared `CitationBuilder`, so guidance hits now carry real `source_url` / `publisher` (per-document `issuing_body`) / `license` instead of empty strings and a bare section number. `search_guidance` is fail-closed: a document with no resolvable `source_url` (`url` → `pdf_url`) is dropped and counted in `skipped_incomplete`.
- Migration verified for this corpus: `SELECT COUNT(*) FROM guidance_documents WHERE url IS NULL AND pdf_url IS NULL` = 0 (all 129 guidance documents resolve a `source_url`; none are dropped by the fail-closed change).
- Added test coverage for the bare unnumbered `ANNEX` parser path (PR #82) in `tests/scripts/parse-annexes.test.ts`: a single bare `ANNEX` → exactly one "Annex I"; a mixed numbered+bare case pins the documented quirk that a trailing bare `ANNEX` defaults to "Annex I" unconditionally (colliding with a pre-existing numbered "Annex I").

### Added

**2 Binding Implementing/Delegated Regulations (NIS2 + DORA Level 2)**
- `NIS2_IR_TECHNICAL_REQUIREMENTS` — Commission Implementing Regulation (EU) 2024/2690, technical and methodological requirements for cybersecurity risk-management measures under NIS2 Art. 21(5) (DNS/TLD/cloud/data-centre/CDN/MSP/MSSP/online-marketplace/search/social/trust-service entities). 16 articles + Annex (64 KB technical-requirements table), 43 recitals.
- `DORA_RTS_SUBCONTRACTING` — Commission Delegated Regulation (EU) 2025/532, RTS on subcontracting ICT services supporting critical or important functions under DORA Art. 30(5). 7 articles, 13 recitals.
- Both ingested as first-class regulations via `ingest-eurlex.ts`; canonical refs `{id}:art_{n}`. Annex parser now also recognises a single unnumbered `ANNEX` (lands at `art_Annex I`, matching the corpus-wide annex convention).

**12 New Regulation Guides (4 → 16)**
- Tier A: CRA, MDR, MiCA, DSA, DATA_ACT, PLD
- Tier B: CYBERSECURITY_ACT, EUCC, CER, EIDAS2, EHDS, DMA
- Each guide includes proportionality tiers, pitfalls, cross-regulation analysis, key article structures, key recitals, timelines, and citation formats

**41 Individually Addressable Annexes**
- CRA: 8 annexes (essential requirements, product categories, conformity procedures)
- AI Act: 13 annexes (high-risk use cases, GPAI tech docs, systemic risk criteria)
- NIS2: 3 annexes (sector scope lists for essential/important entity classification)
- MDR: 17 annexes (GSPR, classification rules, QMS conformity, clinical evaluation)

**Recital-to-Article Mappings**
- 98 recitals mapped bidirectionally to referenced articles across DORA, AI Act, CRA, NIS2, GDPR, MDR

### Changed

- Upgraded AI Act guide (3→8 pitfalls, +5 key structures, +6 key recitals, +2 delegated acts)
- Upgraded NIS2 guide (+1 delegated act, 3→8 pitfalls, +4 structures, +6 recitals, +3 national examples)
- Upgraded GDPR guide (3→8 pitfalls, +6 cross-regulation refs, +4 structures, +6 recitals, +4 national examples)

### Data Quality

- 4,095 articles across 61 regulations (was 2,528 across 49)
- 4,970 recitals (was 3,869)
- 1,448 official definitions (was 1,226)
- 50 FTS-indexed annexes (was 0)
- 16 regulation guides (was 4)

---

## [1.0.0] - 2026-02-12

### 🎉 Production Release

First production-ready release of the EU Regulations MCP Server with comprehensive coverage of European cybersecurity, financial services, healthcare, and product safety regulations.

### Added

**New Regulations (49 Total)**
- EU Chips Act (32023R1781) - European semiconductor manufacturing regulation
- Critical Raw Materials Act (32024R1252) - Supply chain resilience for critical materials
- Complete DORA technical standards suite (10 RTS/ITS)
- Evidence requirements for all 49 regulations (407 audit artifacts)

**Infrastructure & Deployment**
- Cloudflare Workers support with PostgreSQL adapter
- HTTP REST API with rate limiting middleware
- Database SSL/TLS configuration for production deployments
- Docker container security scanning
- Comprehensive security policy and vulnerability reporting

**Data Quality**
- 2,528 articles across 49 regulations
- 3,869 recitals (45/49 regulations)
- 1,226 official definitions
- 709 control mappings (324 ISO 27001:2022, 385 NIST CSF 2.0)
- 323 sector applicability rules
- 407 evidence requirements

**Monitoring & Automation**
- Daily EUR-Lex update monitoring via GitHub Actions
- Automated freshness checks with issue tracking
- RSS feed pattern matching for regulatory changes
- Source registry table for dynamic regulation tracking

**Security**
- Semgrep static analysis
- Gitleaks secret scanning
- OSSF Scorecard compliance
- Docker image vulnerability scanning
- PostgreSQL SSL/TLS certificate validation

### Changed

- Database size optimized to 19MB
- Improved FTS5 full-text search with special character sanitization
- Enhanced error handling for PostgreSQL connections
- Updated test suite with comprehensive edge cases

### Fixed

- FTS5 query syntax for SQLite full-text search
- PostgreSQL TLS certificate validation
- npm audit vulnerabilities (high/moderate severity)
- GitHub Actions workflow failures (3 workflows)
- DNS namespace for MCP Registry publish

### Documentation

- Comprehensive audit report (94% coverage score, A+ rating)
- Database SSL/TLS configuration guide
- Security setup documentation
- Deployment guides for Cloudflare Workers
- Cross-links to Ansvar open-source ecosystem
- Updated statistics and coverage details

### Coverage Status

**Core Regulations:** 96% complete
- All major EU cybersecurity regulations (GDPR, DORA, NIS2, AI Act, CRA)
- All financial services regulations (MiCA, PSD2, MiFID II, MiFIR)
- All healthcare regulations (EHDS, MDR, IVDR)
- All product safety regulations (GPSR, Machinery, PLD, RED)
- Critical infrastructure (CER, Chips Act, CRMA)
- Automotive cybersecurity (UN R155, UN R156)

**Known Gaps (Pending EU Publication):**
- AI Act implementing acts (Q2-Q3 2026)
- NIS2 incident notification templates (2026)
- MiCA technical standards (throughout 2026)
- eIDAS 2.0 wallet specifications (mid-2026)

## [0.8.0] - 2026-02-10

### Added
- Evidence requirements for all 47 regulations
- EIDAS 2.0 recitals
- Synonym expansion for search queries
- Docker container security scanning

### Changed
- Updated statistics for evidence requirements
- Enhanced recital coverage (3,789 recitals, 44/47 regulations)

### Fixed
- FTS5 search special character handling

## [0.7.0] - 2026-02-08

### Added
- Comprehensive security scanning toolchain
- Database SSL/TLS configuration

### Fixed
- PostgreSQL TLS certificate validation
- GitHub Actions workflow issues
- npm audit vulnerabilities

## [0.6.5] - 2026-02-05

### Changed
- Documentation updates
- MCP Registry integration

## [0.6.0] - 2026-01-30

### Added
- Full DORA technical standards (10 RTS/ITS)
- Cyber Solidarity Act
- Enhanced control mappings

## [0.5.0] - 2026-01-15

### Added
- EHDS (European Health Data Space)
- UN R155 Supplement 3 (latest vehicle cybersecurity)
- Sector applicability rules

## [0.4.0] - 2025-12-20

### Added
- Medical Device Regulation (MDR)
- In Vitro Diagnostic Regulation (IVDR)
- Product safety regulations (GPSR, Machinery, PLD, RED)

## [0.3.0] - 2025-12-10

### Added
- Financial services regulations (MiCA, PSD2, MiFID II, MiFIR)
- Sustainability regulations (CSRD, CSDDD, CBAM, EUDR)

## [0.2.0] - 2025-11-25

### Added
- Digital services regulations (eIDAS 2.0, Data Act, DSA, DMA)
- Full-text search with SQLite FTS5

## [0.1.0] - 2025-11-10

### Added
- Initial release with core cybersecurity regulations
- GDPR, NIS2, DORA, AI Act, CRA
- Basic MCP tools (search, get article, list regulations)
- Pre-built database architecture

---

## Semantic Versioning Strategy

- **Major (x.0.0)**: Breaking API changes, major architecture changes
- **Minor (1.x.0)**: New regulations, delegated acts, new features (backward compatible)
- **Patch (1.0.x)**: Data corrections, bug fixes, security updates

## Links

- [GitHub Repository](https://github.com/Ansvar-Systems/EU_compliance_MCP)
- [npm Package](https://www.npmjs.com/package/@ansvar/eu-regulations-mcp)
- [MCP Registry](https://registry.modelcontextprotocol.io/eu.ansvar/eu-regulations-mcp)
- [Documentation](https://github.com/Ansvar-Systems/EU_compliance_MCP/tree/main/docs)
- [Issue Tracker](https://github.com/Ansvar-Systems/EU_compliance_MCP/issues)
