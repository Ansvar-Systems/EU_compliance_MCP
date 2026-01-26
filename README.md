# EU Regulations MCP Server

**The first open-source MCP server for European cybersecurity regulations.**

Query DORA, NIS2, GDPR, the EU AI Act, Cyber Resilience Act, and more — directly from Claude, Cursor, or any MCP-compatible client.

Built by [Ansvar Systems](https://ansvar.ai) — Stockholm, Sweden

---

## Why This Exists

European cybersecurity compliance is fragmented across dozens of PDFs, EUR-Lex pages, and regulatory documents. We built this for our own threat modeling work and figured others might find it useful.

No more tab-switching. No more "wait, what article was that?" Just ask.

---

## What's Included

| Regulation | Coverage | Status |
|------------|----------|--------|
| **DORA** (Digital Operational Resilience Act) | Full text, 64 articles, 65 definitions | ✅ |
| **NIS2** (Network and Information Security Directive) | Full text, 46 articles, 41 definitions | ✅ |
| **GDPR** (General Data Protection Regulation) | Full text, 99 articles, 26 definitions | ✅ |
| **EU AI Act** | Full text, 113 articles, 68 definitions | ✅ |
| **Cyber Resilience Act** | Full text, 71 articles, 51 definitions | ✅ |
| **EU Cybersecurity Act** | Full text, 69 articles, 22 definitions | ✅ |

**Total: 462 articles, 273 definitions across 6 regulations**

Plus:
- **39 ISO 27001:2022 control mappings** to regulation requirements
- **27 sector applicability rules** for determining which regulations apply

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
→ Returns overview of all 6 regulations with article counts
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
Map ISO 27001:2022 controls to regulation requirements.

```
"Which regulations require access control (A.5.15)?"
→ Returns mappings to GDPR Art 32, DORA Art 9, NIS2 Art 21
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

---

## Data Sources

All content is sourced from official public sources:

- **[EUR-Lex](https://eur-lex.europa.eu/)** — Official EU law portal (CC BY 4.0)
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

### Ingesting New Regulations

```bash
# Ingest a regulation from EUR-Lex
npm run ingest -- 32016R0679 data/seed/gdpr.json

# Check for regulation updates
npm run check-updates

# Rebuild the database
npm run build:db
```

---

## About Ansvar Systems

We build AI-accelerated threat modeling tools for automotive and financial services. This MCP server powers our internal compliance workflows — we're sharing it because navigating EU regulations shouldn't require a law degree.

**[ansvar.ai](https://ansvar.ai)** — Threat modeling in days, not weeks.

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
