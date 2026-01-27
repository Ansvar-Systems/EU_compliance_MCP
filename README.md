# EU Regulations MCP Server

**The EUR-Lex alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Feu-regulations-mcp.svg)](https://www.npmjs.com/package/@ansvar/eu-regulations-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/EU_compliance_MCP?style=social)](https://github.com/Ansvar-Systems/EU_compliance_MCP)
[![Daily EUR-Lex Check](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml)
[![Deploy to Azure](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/deploy-azure.yml/badge.svg)](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/deploy-azure.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/COVERAGE_GAPS.md)
[![Recitals](https://img.shields.io/badge/recitals-3500%2B-blue)](docs/COVERAGE_GAPS.md)
[![Hosted](https://img.shields.io/badge/Azure-hosted-0078D4)](https://eu-regulations-mcp.jollysea-916ea475.westeurope.azurecontainerapps.io/health)

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

## Quick Start

### Installation

```bash
npm install @ansvar/eu-regulations-mcp
```

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

### Hosted Service (Zero Setup)

Already running on Azure - just add to your config:

```json
{
  "mcpServers": {
    "eu-regulations": {
      "url": "https://eu-regulations-mcp.jollysea-916ea475.westeurope.azurecontainerapps.io/mcp"
    }
  }
}
```

See [HANDOVER.md](HANDOVER.md) and [SETUP-CICD.md](SETUP-CICD.md) for deployment details.

---

## Example Queries

Once connected, just ask naturally:

- *"What are the risk management requirements under NIS2 Article 21?"*
- *"How long do I have to report a security incident under DORA?"*
- *"Compare GDPR breach notification with NIS2 incident reporting"*
- *"Does the EU AI Act apply to my recruitment screening tool?"*
- *"What are the essential cybersecurity requirements under the Cyber Resilience Act?"*
- *"Which regulations apply to a healthcare organization in Germany?"*
- *"Map DORA ICT risk management to ISO 27001 controls"*
- *"What is an EU Digital Identity Wallet under eIDAS 2.0?"*
- *"What are my data access rights under the Data Act?"*

**More examples:** [TEST_QUERIES.md](./TEST_QUERIES.md) — 60+ example queries organized by category

---

## What's Included

- **37 Regulations** — GDPR, DORA, NIS2, AI Act, MiCA, eIDAS 2.0, Medical Device Regulation, and 30 more
- **2,278 Articles** + 3,508 Recitals + 1,145 Official Definitions
- **Full-Text Search** — Find relevant articles across all regulations instantly
- **Control Mappings** — 686 mappings to ISO 27001:2022 & NIST CSF 2.0
- **Sector Rules** — Check which regulations apply to your industry
- **Daily Updates** — Automatic freshness checks against EUR-Lex

**Detailed coverage:** [docs/coverage.md](docs/coverage.md)
**Use cases by industry:** [docs/use-cases.md](docs/use-cases.md)
**Available tools:** [docs/tools.md](docs/tools.md)

---

## 🎬 See It In Action

### Why This Works

**Smart Context Management:**
- Search returns **relevant snippets**, not entire regulations
- Article retrieval includes **token usage warnings** for large content
- Cross-references help navigate without loading everything

### Example: EUR-Lex vs. This MCP

| EUR-Lex | This MCP Server |
|---------|-----------------|
| Search by CELEX number | Search by plain English: *"incident reporting timeline"* |
| Navigate 100+ page PDFs | Get the exact article with context |
| Manual cross-referencing | `compare_requirements` tool does it instantly |
| "Which regulations apply to me?" → research for days | `check_applicability` tool → answer in seconds |
| Copy-paste article text | Article + definitions + related requirements |
| Check 37 sites for updates | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**EUR-Lex example:** Download DORA PDF → Ctrl+F "incident" → Read Article 17 → Google "What's a major incident?" → Cross-reference NIS2 → Repeat for 5 regulations

**This MCP:** *"Compare incident reporting requirements across DORA, NIS2, and CRA"* → Done.

---

## ⚠️ Important Disclaimers

### Legal Advice

> **🚨 THIS TOOL IS NOT LEGAL ADVICE 🚨**
>
> Regulation text is sourced verbatim from EUR-Lex and UNECE (official public sources). However:
> - **Control mappings** (ISO 27001, NIST CSF) are interpretive aids, not official guidance
> - **Applicability rules** are generalizations, not legal determinations
> - **Cross-references** are research helpers, not compliance mandates
>
> **Always verify against official sources and consult qualified legal counsel for compliance decisions.**

### Token Usage

> **⚠️ Context Window Warning**
>
> Some articles are very large (e.g., MDR Article 123 = ~70,000 tokens). The MCP server:
> - **Search tool**: Returns smart snippets (safe for context)
> - **Get article tool**: Returns full text (may consume significant tokens)
> - **Recommendation**: Use search first, then fetch specific articles as needed
>
> Claude Desktop has a 200k token context window. Monitor your usage when retrieving multiple large articles.

### ISO Standards Copyright

**No copyrighted ISO standards are included.** Control mappings reference ISO 27001:2022 control IDs only (e.g., "A.5.1", "A.8.2"). The actual text of ISO standards requires a paid license from ISO. This tool helps map regulations to controls but doesn't replace the standard itself.

---

## About Ansvar Systems

We build AI-accelerated threat modeling and compliance tools for automotive, financial services, and healthcare. This MCP server started as our internal reference tool — turns out everyone building for EU markets has the same EUR-Lex frustrations.

So we're open-sourcing it. Navigating 37 regulations shouldn't require a legal team.

**[ansvar.ai](https://ansvar.ai)** — Stockholm, Sweden

---

## Documentation

- **[Coverage Details](docs/coverage.md)** — All 37 regulations with article counts
- **[Use Cases](docs/use-cases.md)** — Industry-specific guidance (fintech, healthcare, IoT, etc.)
- **[Available Tools](docs/tools.md)** — Detailed tool descriptions
- **[Development Guide](docs/development.md)** — Adding regulations, webhooks, CI/CD
- **[Troubleshooting](docs/troubleshooting.md)** — Common issues and fixes
- **[Roadmap](ROADMAP.md)** — Upcoming features (delegated acts, national transpositions)
- **[Coverage Gaps](docs/COVERAGE_GAPS.md)** — Known limitations
- **[Test Queries](TEST_QUERIES.md)** — 60+ example queries

---

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
