# EU Regulations MCP Server

**The EUR-Lex alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Feu-regulations-mcp.svg)](https://www.npmjs.com/package/@ansvar/eu-regulations-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/EU_compliance_MCP?style=social)](https://github.com/Ansvar-Systems/EU_compliance_MCP)
[![Daily EUR-Lex Check](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/COVERAGE_GAPS.md)
[![Recitals](https://img.shields.io/badge/recitals-3500%2B-blue)](docs/COVERAGE_GAPS.md)

Query **37 EU regulations** — from GDPR and AI Act to DORA, MiFID II, eIDAS, Medical Device Regulation, and more — directly from Claude, Cursor, or any MCP-compatible client.

If you're building digital products, financial services, healthcare tech, or connected devices for the European market, this is your compliance reference.

Built by [Ansvar Systems](https://ansvar.ai) — Stockholm, Sweden

---

## Why This Exists

EU compliance is scattered across EUR-Lex PDFs, official journals, and regulatory sites. Whether you're:
- A **developer** implementing GDPR data rights or NIS2 incident reporting
- A **product team** navigating AI Act risk assessments or Medical Device conformity
- A **compliance officer** mapping ISO 27001 to DORA requirements
- A **legal researcher** comparing PSD2 authentication vs. eIDAS trust services

...you shouldn't need a law degree and 47 browser tabs. Ask Claude. Get the exact article. With context.

This MCP server makes EU regulations **searchable, cross-referenceable, and AI-readable**.

---

## What's Included

### 37 Regulations — Full Text, Searchable

**Core Data Protection & Cybersecurity**
| Regulation | Articles | Definitions |
|------------|----------|-------------|
| GDPR | 99 | 26 |
| NIS2 | 46 | 41 |
| DORA | 64 | 65 |
| AI Act | 113 | 68 |
| Cyber Resilience Act | 71 | 51 |
| EU Cybersecurity Act | 69 | 22 |
| Cyber Solidarity Act | 26 | 17 |
| ePrivacy Directive | 21 | — |
| Law Enforcement Directive | 65 | 16 |
| EUCC (Cybersecurity Certification) | 50 | 15 |

**Digital Services & Identity**
| Regulation | Articles | Definitions |
|------------|----------|-------------|
| eIDAS 2.0 | 49 | 57 |
| Data Act | 50 | 42 |
| DSA | 93 | 24 |
| DMA | 54 | 33 |
| Data Governance Act | 38 | 21 |
| EECC (Electronic Communications) | 128 | 42 |

**Healthcare & Medical**
| Regulation | Articles | Definitions |
|------------|----------|-------------|
| EHDS (Health Data Space) | 105 | — |
| MDR (Medical Devices) | 123 | 64 |
| IVDR (In Vitro Diagnostics) | 113 | 70 |

**Financial Services**
| Regulation | Articles | Definitions |
|------------|----------|-------------|
| MiCA (Crypto-Assets) | 149 | 51 |
| PSD2 (Payment Services) | 117 | 48 |
| MiFID II | 97 | 63 |
| MiFIR | 55 | 47 |
| AIFMD | 71 | — |
| SFDR (ESG Disclosure) | 20 | 24 |
| EU Taxonomy | 27 | 23 |

**Product Safety & Sustainability**
| Regulation | Articles | Definitions |
|------------|----------|-------------|
| GPSR (Product Safety) | 52 | 28 |
| Machinery Regulation | 54 | 36 |
| PLD (Product Liability) | 24 | 18 |
| RED (Radio Equipment) | 52 | 26 |
| CSRD (Sustainability Reporting) | 8 | — |
| CSDDD (Due Diligence) | 39 | — |
| CBAM (Carbon Border) | 36 | 34 |
| EUDR (Deforestation) | 38 | 40 |
| CER (Critical Entities) | 29 | 10 |

**Automotive**
| Regulation | Articles | Definitions |
|------------|----------|-------------|
| UN R155 (Vehicle Cybersecurity) | 17 | 13 |
| UN R156 (Software Updates) | 16 | 11 |

**Total: 2,278 articles, 1,145 definitions across 37 regulations**

Plus:
- **686 security framework control mappings**:
  - 313 ISO 27001:2022 controls mapped to regulation requirements
  - 373 NIST CSF 2.0 controls mapped to regulation requirements
- **305 sector applicability rules** for determining which regulations apply

---

## Who This Is For

This isn't just for security teams. If you're building **anything** that touches the EU market, you need these regulations:

**🏦 Fintech & Banking**
- Payment processors → PSD2, DORA, MiFID II
- Crypto platforms → MiCA, DORA
- Trading systems → MiFIR, DORA
- Fund management → AIFMD, SFDR

**🏥 Healthcare & MedTech**
- Health apps → GDPR, EHDS, MDR
- Medical devices → MDR, IVDR, CRA
- Clinical systems → NIS2, GDPR, EHDS

**🤖 AI & Machine Learning**
- Any AI system → EU AI Act (high-risk classification)
- HR tech, recruitment → AI Act + GDPR
- Content moderation → DSA, AI Act

**🏭 IoT & Connected Products**
- Smart devices → CRA, RED, GDPR
- Industrial IoT → Machinery, NIS2, CRA
- Automotive → UN R155/R156, CRA

**☁️ SaaS & Digital Platforms**
- Cloud services → Data Act, GDPR, NIS2
- Marketplaces → DSA, DMA, Consumer Rights
- B2B platforms → Data Act, DGA

**📱 Consumer Tech**
- Mobile apps → GDPR, DSA, ePrivacy, CRA
- E-commerce → GDPR, Consumer Rights, DSA
- Social platforms → DSA, DMA, GDPR

---

## Installation

### For Users (Recommended)

Install the package - it comes with a pre-built database:

```bash
npm install @ansvar/eu-regulations-mcp
```

The database includes:
- ✅ 37 EU regulations (2,278 articles)
- ✅ 3,508 recitals with legislative intent (33/37 regulations)
- ✅ 1,145 definitions
- ✅ ISO 27001:2022 & NIST CSF 2.0 mappings

**No build step needed** - the package ships with a complete database.

### For Maintainers/Contributors

If you need to re-ingest regulations (e.g., after EUR-Lex updates):

```bash
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP.git
cd EU_compliance_MCP
npm install
npm run reingest:all  # Uses Puppeteer to bypass EUR-Lex WAF
npm run build:db      # Rebuild database from updated JSON
npm test              # Verify everything works
```

---

## Quick Start

### Claude Desktop

Add to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "eu-regulations": {
      "command": "npx",
      "args": ["-y", "@ansvar/eu-regulations-mcp"]
    }
  }
}
```

Restart Claude Desktop. Done.

### Cursor / VS Code

```json
{
  "mcp.servers": {
    "eu-regulations": {
      "command": "npx",
      "args": ["-y", "@ansvar/eu-regulations-mcp"]
    }
  }
}
```

### Docker (Self-Hosted)

```bash
docker run -d --name eu-regs-mcp \
  ansvar/eu-regulations-mcp:latest
```

---

## Testing & Coverage

**Want to try it out?**
- [TEST_QUERIES.md](./TEST_QUERIES.md) - 60+ example queries organized by category
- [COVERAGE_GAPS.md](./COVERAGE_GAPS.md) - Known limitations and roadmap

**TL;DR:** Base regulations work perfectly. Recitals available for GDPR (173); other regulations blocked by EUR-Lex WAF protection (2026-01-27). Delegated acts and national transpositions are roadmap items.

---

## Available Tools

### `search_regulations`
Full-text search across all regulations.

```
"Search for incident reporting requirements across all regulations"
→ Returns matching articles from DORA, NIS2, GDPR with context
```

### `get_article`
Retrieve a specific article with full text and context.

```
"Get DORA Article 17"
→ Returns ICT-related incident management process requirements
```

### `get_recital`
Retrieve legislative intent and interpretation guidance from regulation preambles.

```
"Get GDPR Recital 83"
→ Returns: Context for "appropriate technical measures"
  (encryption, pseudonymization, resilience testing)
```

### `list_regulations`
List available regulations or show detailed structure.

```
"List all regulations"
→ Returns overview of all 37 regulations with article counts
```

### `get_definitions`
Get official definitions from any regulation.

```
"What does NIS2 define as an 'essential entity'?"
→ Returns Article 3 definition + criteria
```

### `compare_requirements`
Side-by-side comparison between frameworks.

```
"Compare incident reporting timelines between DORA and NIS2"
→ DORA: 4 hours (major), 24 hours (intermediate)
→ NIS2: 24 hours (early warning), 72 hours (full notification)
```

### `check_applicability`
Determine if a regulation applies to an entity type.

```
"Does DORA apply to a Swedish fintech with 50 employees?"
→ Yes, if providing financial services covered under Article 2
```

### `map_controls`
Map security framework controls to regulation requirements. Supports ISO 27001:2022 and NIST CSF.

```
"Which regulations require access control (ISO 27001 A.5.15)?"
→ Returns mappings to GDPR Art 32, DORA Art 9, NIS2 Art 21

"Map NIST CSF incident response controls to EU regulations"
→ Returns RS.MA-01 mappings to GDPR Art 33-34, NIS2 Art 23, DORA Art 17-19
```

---

## Example Queries

Once connected, just ask naturally:

- *"What are the risk management requirements under NIS2 Article 21?"*
- *"How long do I have to report a security incident under DORA?"*
- *"Compare GDPR breach notification with NIS2 incident reporting"*
- *"Does the EU AI Act apply to my recruitment screening tool?"*
- *"What are the essential cybersecurity requirements under the Cyber Resilience Act?"*
- *"Which regulations apply to a healthcare organization in Germany?"*
- *"What threats must be mitigated under UN R155 Annex 5?"*
- *"What is a Cybersecurity Management System (CSMS) under R155?"*
- *"What are the requirements for OTA software updates under R156?"*
- *"What is RXSWIN and how is it used in R156?"*
- *"What is an EU Digital Identity Wallet under eIDAS 2.0?"*
- *"What are the trust service provider requirements in eIDAS?"*
- *"What are my data access rights under the Data Act?"*
- *"How do cloud switching requirements work in the Data Act?"*
- *"What are the notice-and-action requirements under the DSA?"*
- *"What obligations do Very Large Online Platforms have under DSA?"*
- *"What is a gatekeeper under the Digital Markets Act?"*
- *"What interoperability requirements does the DMA impose on messaging apps?"*

---

## Why Not Just Use EUR-Lex?

EUR-Lex is authoritative. It's also **designed for lawyers, not developers**.

| EUR-Lex | This MCP Server |
|---------|-----------------|
| Search by CELEX number | Search by plain English: *"incident reporting timeline"* |
| Navigate 100+ page PDFs | Get the exact article with context |
| Manual cross-referencing | `compare_requirements` tool does it instantly |
| "Which regulations apply to me?" → research for days | `check_applicability` tool → answer in seconds |
| Copy-paste article text | Article + definitions + related requirements |
| Check 37 sites for updates | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**Example:**
- EUR-Lex: Download DORA PDF → Ctrl+F "incident" → Read Article 17 → Google "What's a major incident?" → Cross-reference NIS2 → Repeat for 5 regulations
- This MCP: *"Compare incident reporting requirements across DORA, NIS2, and CRA"* → Done.

This isn't replacing EUR-Lex. It's making it **usable in 2026**.

---

## Data Sources

All content is sourced from official public sources:

- **[EUR-Lex](https://eur-lex.europa.eu/)** — Official EU law portal (CC BY 4.0)
- **[UNECE](https://unece.org/)** — UN Economic Commission for Europe (UN R155, R156)
- **[ENISA](https://enisa.europa.eu/)** — EU Agency for Cybersecurity guidance

No copyrighted ISO standards are included. For ISO 27001 full text, you'll need to purchase licenses from ISO.

---

## Development

```bash
# Clone the repository
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP
cd eu-regulations-mcp

# Install dependencies
npm install

# Run tests
npm test

# Run in development
npm run dev

# Build for production
npm run build
```

### Adding New Regulations

Adding a regulation is a single command — it's automatically monitored for updates:

```bash
# Ingest an EU regulation from EUR-Lex
npx tsx scripts/ingest-eurlex.ts 32024R1183 data/seed/eidas2.json
npm run build:db

# That's it. The regulation is now:
# - In the database
# - Automatically monitored by daily EUR-Lex checker
# - Included in auto-update workflow
```

### Freshness Monitoring

A GitHub Actions workflow runs daily at 6 AM UTC to ensure regulations stay current:

- **Checks EUR-Lex RSS feeds** for recent legislative changes
- **Compares versions** against local database
- **Creates GitHub issues** when updates are available
- **Auto-closes issues** when regulations are current

To manually check for updates:

```bash
npm run check-updates
```

To trigger auto-update (re-ingest all + publish):
1. Go to Actions → Daily EUR-Lex Update Check
2. Run workflow with `auto_update: true`

---

## Disclaimer

**This tool is not legal advice.** Regulation text is sourced verbatim from EUR-Lex and UNECE. Control mappings, applicability rules, and cross-references are interpretive aids — useful for compliance research, but not a substitute for qualified legal counsel.

Always verify against official sources for compliance decisions.

---

## About Ansvar Systems

We build AI-accelerated threat modeling and compliance tools for automotive, financial services, and healthcare. This MCP server started as our internal reference tool — turns out everyone building for EU markets has the same EUR-Lex frustrations.

So we're open-sourcing it. Navigating 37 regulations shouldn't require a legal team.

**[ansvar.ai](https://ansvar.ai)** — Stockholm, Sweden

---

## Troubleshooting

### Database Not Found Error

If you see `Failed to open database at .../data/regulations.db`:

The database is built automatically during installation via the `postinstall` script. If it's missing:

```bash
# Rebuild the database
npm run build:db

# Or if installed globally/via npx, reinstall
npm install -g @ansvar/eu-regulations-mcp --force
```

The database contains all 37 regulations (~15MB). It's gitignored in the source repo but built during:
- `npm install` (postinstall hook)
- `npm publish` (prepublishOnly hook)

### MCP Server Not Starting

Check that you're using Node.js 18 or higher:

```bash
node --version  # Should be v18.0.0 or higher
```

### Slow First Query

The first query after startup may be slow (~1-2s) as SQLite loads the database into memory. Subsequent queries are fast (<50ms).

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

---

## Contributing

PRs welcome, especially for:
- Additional regulation coverage
- Improved cross-references
- National transposition details
- Bug fixes and improvements

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>

