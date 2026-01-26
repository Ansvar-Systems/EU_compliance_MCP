# EU Compliance MCP Server

An open-source [Model Context Protocol](https://modelcontextprotocol.io/) server providing access to EU cybersecurity regulations. Query GDPR, NIS2, DORA, AI Act, and more directly from Claude.

## Features

- **Full-text search** across all EU regulations
- **Article retrieval** with chapter and cross-reference context
- **Cross-framework comparison** (e.g., "How do DORA and NIS2 incident timelines differ?")
- **ISO 27001:2022 control mapping** to regulation requirements
- **Applicability checker** based on sector and entity type
- **Official definitions** from regulation text

## Regulations (Phase 1)

| Regulation | Status | Articles | Definitions |
|------------|--------|----------|-------------|
| GDPR | ✅ Complete | 99 | 23 |
| NIS2 | ✅ Complete | 46 | 37 |
| DORA | ✅ Complete | 64 | 64 |
| AI Act | ✅ Complete | 113 | 65 |
| Cyber Resilience Act | ✅ Complete | 71 | 49 |
| EU Cybersecurity Act | ✅ Complete | 69 | 21 |

**Total: 462 articles, 259 definitions**

## Installation

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "eu-compliance": {
      "command": "npx",
      "args": ["-y", "github:Ansvar-Systems/EU_compliance_MCP"]
    }
  }
}
```

Restart Claude Desktop. The server will be built automatically on first run.

### Local Development

```bash
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP.git
cd EU_compliance_MCP
npm install  # Builds TypeScript and database automatically
```

## Available Tools

### search_regulations
Search across all regulations for matching articles.

```
Query: "incident reporting requirements"
Returns: Relevant articles with highlighted snippets
```

### get_article
Retrieve a specific article's full text.

```
Input: { regulation: "GDPR", article: "33" }
Returns: Full article text with context
```

### list_regulations
List available regulations or show structure of a specific one.

### compare_requirements
Compare how different regulations address the same topic.

```
Input: { topic: "incident reporting", regulations: ["DORA", "NIS2", "GDPR"] }
Returns: Side-by-side comparison with timelines
```

### map_controls
Map ISO 27001:2022 controls to regulation requirements.

```
Input: { framework: "ISO27001", control: "A.6.8" }
Returns: Which articles satisfy this control
```

### check_applicability
Determine which regulations apply to your organization.

```
Input: { sector: "financial", subsector: "bank" }
Returns: GDPR, DORA, NIS2 with confidence levels
```

### get_definitions
Look up official definitions from regulations.

```
Input: { term: "personal data" }
Returns: Definition from GDPR Article 4
```

## Data Sources

All regulation text is sourced directly from [EUR-Lex](https://eur-lex.europa.eu/) using the official HTML format.

### Ingesting Regulations

```bash
# Ingest a regulation from EUR-Lex
npm run ingest -- 32016R0679 data/seed/gdpr.json

# Check for regulation updates
npm run check-updates
```

Known CELEX IDs:
- `32016R0679` - GDPR
- `32022L2555` - NIS2
- `32022R2554` - DORA
- `32024R1689` - AI Act
- `32024R2847` - Cyber Resilience Act
- `32019R0881` - EU Cybersecurity Act

### Control Mappings & Applicability

| Data Type | Count |
|-----------|-------|
| ISO 27001:2022 Control Mappings | 39 |
| Sector Applicability Rules | 27 |

## Development

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Build
npm run build

# Run in development
npm run dev
```

## Adding Regulations

Create a JSON file in `data/seed/`:

```json
{
  "id": "REGULATION_ID",
  "full_name": "Full Regulation Name",
  "celex_id": "32024RXXXX",
  "effective_date": "2024-01-01",
  "articles": [
    {
      "number": "1",
      "title": "Article Title",
      "text": "Article text...",
      "chapter": "I"
    }
  ],
  "definitions": [
    {
      "term": "term name",
      "definition": "definition text",
      "article": "4"
    }
  ]
}
```

Then rebuild the database:

```bash
npm run build:db
```

## License

Apache-2.0

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting PRs.

## Acknowledgments

- Regulation text sourced from [EUR-Lex](https://eur-lex.europa.eu/) (CC BY 4.0)
- Built with the [MCP SDK](https://github.com/modelcontextprotocol/sdk)

---

Made with care by [Ansvar Systems](https://ansvar.ai)
