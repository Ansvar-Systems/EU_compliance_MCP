# EU Regulations MCP Server - Documentation

This folder contains documentation for the EU Regulations MCP Server.

## Contents

### Cloudflare Workers (HTTP API)

- **[HTTP API Reference](./http-api.md)** - REST-style API for ChatGPT/Copilot
- [Deployment Guide](./deployment-guide.md) - Cloudflare Workers + Neon PostgreSQL setup
- [PostgreSQL Setup](./postgres-setup.md) - Database migration and configuration
- [Troubleshooting](./troubleshooting.md) - Common issues and solutions

### Original Architecture

- [Design Document](./plans/2025-01-26-eu-compliance-mcp-design.md) - Original architecture and design decisions

## Quick Links

- [Main README](../README.md) - Installation and usage guide
- [CONTRIBUTING](../CONTRIBUTING.md) - Contribution guidelines
- [CLAUDE.md](../CLAUDE.md) - Development guide for AI assistants

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   MCP Clients                        │
│         (Claude Desktop, Cursor, etc.)               │
└─────────────────────┬───────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         │                         │
         ▼                         ▼
┌─────────────────┐      ┌─────────────────┐
│  stdio transport │      │  HTTP transport  │
│   (local CLI)    │      │   (HTTP mode)    │
└────────┬────────┘      └────────┬────────┘
         │                         │
         └────────────┬────────────┘
                      ▼
┌─────────────────────────────────────────────────────┐
│              eu-regulations-mcp                      │
│                (MCP Server)                          │
├─────────────────────────────────────────────────────┤
│  Tools:                                              │
│  - search_regulations    - map_controls              │
│  - get_article          - check_applicability        │
│  - list_regulations     - get_definitions            │
│  - compare_requirements                              │
├─────────────────────────────────────────────────────┤
│  Database Layer: SQLite + FTS5                       │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│              regulations.db                          │
│  - 12 EU regulations (741 articles)                 │
│  - 453 official definitions                         │
│  - 322 security framework control mappings          │
│  - 105 sector applicability rules                   │
└─────────────────────────────────────────────────────┘
```

## Deployment Options

### Local Installation (stdio)

For Claude Desktop, Cursor, or any MCP client that supports local servers:

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

### Docker

```bash
docker run -p 3000:3000 ansvar/eu-regulations-mcp:latest
```

## Available Tools

| Tool | Description |
|------|-------------|
| `search_regulations` | Full-text search across all 12 EU regulations |
| `get_article` | Retrieve specific article with full text |
| `list_regulations` | List available regulations and structure |
| `compare_requirements` | Compare requirements across regulations |
| `map_controls` | Map ISO 27001 / NIST CSF controls to articles |
| `check_applicability` | Determine which regulations apply by sector |
| `get_definitions` | Look up official legal definitions |

## Regulations Covered

| ID | Regulation | Articles | Definitions |
|----|------------|----------|-------------|
| GDPR | General Data Protection Regulation | 99 | 26 |
| NIS2 | Network and Information Security Directive | 46 | 41 |
| DORA | Digital Operational Resilience Act | 64 | 65 |
| AI_ACT | EU AI Act | 113 | 68 |
| CRA | Cyber Resilience Act | 71 | 51 |
| CYBERSECURITY_ACT | EU Cybersecurity Act | 69 | 22 |
| EIDAS2 | European Digital Identity | 49 | 57 |
| DATA_ACT | Data Act | 50 | 42 |
| DSA | Digital Services Act | 93 | 24 |
| DMA | Digital Markets Act | 54 | 33 |
| UN_R155 | Vehicle Cybersecurity | 12 + annexes | 13 |
| UN_R156 | Vehicle Software Updates | 12 + annexes | 11 |

## Development

```bash
# Install dependencies
npm install

# Run in development (stdio)
npm run dev

# Run in development (HTTP)
npm run dev:http

# Run tests
npm test

# Build for production
npm run build
```

## Data Sources

All content sourced from official public sources:

- [EUR-Lex](https://eur-lex.europa.eu/) - Official EU law portal (CC BY 4.0)
- [UNECE](https://unece.org/) - UN Economic Commission for Europe

## License

Apache License 2.0
