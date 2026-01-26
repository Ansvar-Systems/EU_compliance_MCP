# Your MCP Server Name

<!--
╔═══════════════════════════════════════════════════════════════════════════╗
║                          README TEMPLATE                                  ║
║                                                                           ║
║  Replace this header and all [PLACEHOLDERS] with your actual content.    ║
║  Delete these comments when you're done customizing.                      ║
╚═══════════════════════════════════════════════════════════════════════════╝
-->

> MCP server providing AI assistants with access to [Your Content Domain]

[![npm version](https://img.shields.io/npm/v/@ansvar/your-mcp-server)](https://www.npmjs.com/package/@ansvar/your-mcp-server)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

---

## Overview

This MCP (Model Context Protocol) server gives AI assistants access to [describe your content - e.g., "EU cybersecurity regulations", "Swedish statutes", etc.].

### What's Included

| Source | Description | Items |
|--------|-------------|-------|
| [SOURCE_A] | [Description] | [X] |
| [SOURCE_B] | [Description] | [Y] |
| ... | ... | ... |

### Use Cases

- **[Use case 1]**: "What does [X] say about [Y]?"
- **[Use case 2]**: "Compare [X] and [Y]"
- **[Use case 3]**: "Show me [specific content]"

---

## Installation

### Option 1: npm (Recommended)

```bash
npm install -g @ansvar/your-mcp-server
```

### Option 2: Docker

```bash
docker pull ansvar/your-mcp-server
```

### Option 3: From Source

```bash
git clone https://github.com/ansvar-systems/your-mcp-server.git
cd your-mcp-server
npm install
npm run build
```

---

## Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "your-mcp-server": {
      "command": "npx",
      "args": ["@ansvar/your-mcp-server"]
    }
  }
}
```

### Cursor / Continue

Add to your MCP configuration:

```json
{
  "your-mcp-server": {
    "command": "npx",
    "args": ["@ansvar/your-mcp-server"]
  }
}
```

### Docker

```json
{
  "your-mcp-server": {
    "command": "docker",
    "args": ["run", "-i", "ansvar/your-mcp-server"]
  }
}
```

---

## Available Tools

### `search_content`

Full-text search across all content.

```json
{
  "name": "search_content",
  "arguments": {
    "query": "your search terms",
    "sources": ["SOURCE_A"],
    "limit": 10
  }
}
```

**Parameters:**
- `query` (required): Search terms
- `sources` (optional): Filter to specific sources
- `limit` (optional): Max results (default: 10)

---

### `get_item`

Get a specific item by identifier.

```json
{
  "name": "get_item",
  "arguments": {
    "source": "SOURCE_A",
    "item_id": "1"
  }
}
```

**Parameters:**
- `source` (required): Source identifier
- `item_id` (required): Item identifier
- `include_related` (optional): Include cross-references

---

### `list_sources`

List available sources and their contents.

```json
{
  "name": "list_sources",
  "arguments": {
    "source": "SOURCE_A"
  }
}
```

**Parameters:**
- `source` (optional): List items in this source (omit to list all sources)

---

### `lookup_definition`

Look up the official definition of a term.

```json
{
  "name": "lookup_definition",
  "arguments": {
    "term": "your term"
  }
}
```

**Parameters:**
- `term` (required): Term to look up
- `source` (optional): Limit to specific source

---

## Examples

### Example 1: [Use Case]

**Prompt:** "[User question]"

**Claude uses:**
```json
{
  "name": "search_content",
  "arguments": {
    "query": "[search terms]"
  }
}
```

**Response:** [Description of what Claude returns]

---

### Example 2: [Use Case]

**Prompt:** "[User question]"

**Claude uses:**
```json
{
  "name": "get_item",
  "arguments": {
    "source": "[SOURCE]",
    "item_id": "[ID]"
  }
}
```

---

## Data Sources

| Source | Official URL | Last Updated |
|--------|--------------|--------------|
| [Name] | [URL] | [Date] |

See [COVERAGE.md](COVERAGE.md) for detailed coverage information.

---

## Development

### Setup

```bash
git clone https://github.com/ansvar-systems/your-mcp-server.git
cd your-mcp-server
npm install
```

### Building

```bash
npm run build        # Compile TypeScript
npm run build:db     # Rebuild database from seed
```

### Testing

```bash
npm test             # Run tests
npm run test:coverage # With coverage
```

### Running Locally

```bash
npm run dev          # Run directly with tsx
```

### Testing with MCP Inspector

```bash
npx @anthropic/mcp-inspector node dist/index.js
```

---

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

---

## License

Apache 2.0 - see [LICENSE](LICENSE)

---

## About

Built by [**Ansvar Systems AB**](https://ansvar.ai) - Building the compliance infrastructure for Nordic AI.

Part of the [Ansvar MCP Ecosystem](https://github.com/ansvar-systems):
- 🇪🇺 [@ansvar/eu-regulations-mcp](https://github.com/ansvar-systems/eu-regulations-mcp)
- 🇸🇪 @ansvar/swedish-law-mcp (coming soon)
- 🇳🇴🇩🇰🇫🇮 @ansvar/nordic-law-mcp (coming soon)
