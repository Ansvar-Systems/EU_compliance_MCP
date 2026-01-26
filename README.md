# EU Regulations MCP Server

**The first open-source MCP server for European cybersecurity regulations.**

Query **37 EU regulations** including DORA, NIS2, GDPR, AI Act, MiFID II, EHDS, and more — directly from Claude, Cursor, or any MCP-compatible client.

Built by [Ansvar Systems](https://ansvar.ai) — Stockholm, Sweden

---

## Why This Exists

European cybersecurity compliance is fragmented across dozens of PDFs, EUR-Lex pages, and regulatory documents. We built this for our own threat modeling work and figured others might find it useful.

No more tab-switching. No more "wait, what article was that?" Just ask.

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

### From Source

```bash
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP
cd eu-regulations-mcp
npm install
npm run build
npm start
```

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

### `list_regulations`
List available regulations or show detailed structure.

```
"List all regulations"
→ Returns overview of all 9 regulations with article counts
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

We build AI-accelerated threat modeling tools for automotive and financial services. This MCP server powers our internal compliance workflows — we're sharing it because navigating EU regulations shouldn't require a law degree.

**[ansvar.ai](https://ansvar.ai)** — Threat modeling in days, not weeks.

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

The database contains all 37 regulations (12MB). It's gitignored in the source repo but built during:
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
