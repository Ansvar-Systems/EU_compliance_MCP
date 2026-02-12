# Changelog

All notable changes to the EU Regulations MCP Server will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
