# Contributing to EU Regulations MCP

Thank you for your interest in contributing to the EU Regulations MCP Server! This document provides guidelines for contributions.

## How to Contribute

### Reporting Issues

- Check existing issues before creating a new one
- Use a clear, descriptive title
- Include steps to reproduce bugs
- Include relevant error messages or logs

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with a clear message
6. Push to your fork
7. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow existing code patterns
- Include tests for new functionality
- Keep commits focused and atomic

## Areas We're Looking For Help

### Additional Regulations

We welcome contributions adding new EU regulations. Adding a regulation is **one command**:

```bash
npx tsx scripts/ingest-eurlex.ts <CELEX_ID> data/seed/<name>.json
npm run build:db
```

That's it! The regulation is automatically:
- Added to the database
- Monitored by the daily EUR-Lex freshness checker
- Included in auto-update workflows

After ingesting, update README.md with the new regulation counts.

### Cross-Reference Mappings

Help us improve mappings between:
- Regulations (e.g., DORA ↔ NIS2 overlap)
- ISO 27001 controls (in `data/seed/mappings/`)
- Sector applicability rules

### National Transpositions

For NIS2 and other directives, we'd love to include national implementations:
- Swedish Cybersäkerhetslagen
- German NIS2UmsuCG
- Other member state laws

### Bug Fixes and Improvements

- Fix parsing issues in regulation text
- Improve search relevance
- Better error handling
- Performance optimizations

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR-USERNAME/eu-regulations-mcp
cd eu-regulations-mcp

# Install dependencies
npm install

# Run in development
npm run dev

# Run tests
npm test

# Build
npm run build
```

## Data Sources

All regulation text must come from official public sources:

- **EUR-Lex** (eur-lex.europa.eu) - CC BY 4.0 license
- **UNECE** (unece.org) - Public
- **ENISA** (enisa.europa.eu) - Public

Do **not** include copyrighted ISO/IEC standards.

## Questions?

Open an issue or reach out at hello@ansvar.eu.

---

By contributing, you agree that your contributions will be licensed under the Apache License 2.0.
