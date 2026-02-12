# EU Regulations MCP Server

**The EUR-Lex alternative for the AI age.**

[![npm version](https://badge.fury.io/js/@ansvar%2Feu-regulations-mcp.svg)](https://www.npmjs.com/package/@ansvar/eu-regulations-mcp)
[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/eu.ansvar/eu-regulations-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/EU_compliance_MCP?style=social)](https://github.com/Ansvar-Systems/EU_compliance_MCP)
[![Daily EUR-Lex Check](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/COVERAGE_GAPS.md)
[![Recitals](https://img.shields.io/badge/recitals-3500%2B-blue)](docs/COVERAGE_GAPS.md)

Query **49 EU regulations** — from GDPR and AI Act to DORA, Chips Act, MiFID II, eIDAS, Medical Device Regulation, and more — directly from Claude, Cursor, or any MCP-compatible client.

If you're building digital products, financial services, healthcare tech, or connected devices for the European market, this is your compliance reference.

Built by [Ansvar Systems](https://ansvar.eu) — Stockholm, Sweden

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

**Option 1: Claude Desktop (Recommended)**

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

Restart Claude Desktop. Done!

**Option 2: MCP Registry**

Browse and install from the [official MCP registry](https://registry.modelcontextprotocol.io/):
- Search for "EU Regulations" or view directly: [`eu.ansvar/eu-regulations-mcp`](https://registry.modelcontextprotocol.io/eu.ansvar/eu-regulations-mcp)
- One-click install (when registry integration is live in Claude Desktop)
- Automatic updates when new versions are released

**Option 3: Cursor / VS Code**

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

**Option 4: Global npm Install**

```bash
npm install -g @ansvar/eu-regulations-mcp
```

Then use `"command": "eu-regulations-mcp"` in your config (without npx).

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

- **49 Regulations** — GDPR, DORA, NIS2, AI Act, Chips Act, MiCA, eIDAS 2.0, Medical Device Regulation, and 40 more
- **2,528 Articles** + 3,869 Recitals + 1,226 Official Definitions
- **Full-Text Search** — Find relevant articles across all regulations instantly
- **Control Mappings** — 709 mappings to ISO 27001:2022 & NIST CSF 2.0
- **Evidence Requirements** — 407 audit artifacts across all 49 regulations
- **Sector Rules** — 323 applicability rules across all sectors and industries
- **Daily Updates** — Automatic freshness checks against EUR-Lex

**Detailed coverage:** [docs/coverage.md](docs/coverage.md)
**Use cases by industry:** [docs/use-cases.md](docs/use-cases.md)
**Available tools:** [docs/tools.md](docs/tools.md)

---

## 🎬 See It In Action

### Why This Works

**Verbatim Source Text (No LLM Processing):**
- All article text is ingested from EUR-Lex/UNECE official sources
- Snippets are returned **unchanged** from SQLite FTS5 database rows
- Zero LLM summarization or paraphrasing — the database contains regulation text, not AI interpretations
- **Note:** HTML-to-text conversion normalizes whitespace/formatting, but preserves content

**Smart Context Management:**
- Search returns **32-token snippets** with highlighted matches (safe for context)
- Article retrieval warns about token usage (some articles = 70k tokens)
- Cross-references help navigate without loading everything at once

**Technical Architecture:**
```
EUR-Lex HTML → Parse → SQLite → FTS5 snippet() → MCP response
                  ↑                    ↑
           Formatting only      Verbatim database query
```

### Example: EUR-Lex vs. This MCP

| EUR-Lex | This MCP Server |
|---------|-----------------|
| Search by CELEX number | Search by plain English: *"incident reporting timeline"* |
| Navigate 100+ page PDFs | Get the exact article with context |
| Manual cross-referencing | `compare_requirements` tool does it instantly |
| "Which regulations apply to me?" → research for days | `check_applicability` tool → answer in seconds |
| Copy-paste article text | Article + definitions + related requirements |
| Check 47 sites for updates | Daily automated freshness checks |
| No API, no integration | MCP protocol → AI-native |

**EUR-Lex example:** Download DORA PDF → Ctrl+F "incident" → Read Article 17 → Google "What's a major incident?" → Cross-reference NIS2 → Repeat for 5 regulations

**This MCP:** *"Compare incident reporting requirements across DORA, NIS2, and CRA"* → Done.

---

## 📚 Documentation

- **[Database SSL/TLS Configuration](docs/DATABASE_SSL.md)** - Secure PostgreSQL connections for Cloudflare Workers deployments
- **[Security Policy](SECURITY.md)** - Vulnerability reporting and security best practices
- **[Coverage Gaps](docs/COVERAGE_GAPS.md)** - Known missing content from EUR-Lex
- **[GitHub Actions Setup](docs/GITHUB_ACTIONS_SETUP.md)** - CI/CD workflow configuration

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

## Related Projects: Complete Compliance Suite

This server is part of **Ansvar's Compliance Suite** - three MCP servers that work together for end-to-end compliance coverage:

### 🇪🇺 EU Regulations MCP (This Project)
**Query 47 EU regulations directly from Claude**
- GDPR, AI Act, DORA, NIS2, MiFID II, PSD2, eIDAS, MDR, and 39 more
- Full regulatory text with article-level search
- Cross-regulation reference and comparison
- **Install:** `npx @ansvar/eu-regulations-mcp`

### 🇺🇸 [US Regulations MCP](https://github.com/Ansvar-Systems/US_Compliance_MCP)
**Query US federal and state compliance laws directly from Claude**
- HIPAA, CCPA, SOX, GLBA, FERPA, COPPA, FDA 21 CFR Part 11, and 8 more
- Federal and state privacy law comparison
- Breach notification timeline mapping
- **Install:** `npm install @ansvar/us-regulations-mcp`

### 🔐 [Security Controls MCP](https://github.com/Ansvar-Systems/security-controls-mcp)
**Query 1,451 security controls across 28 frameworks**
- ISO 27001, NIST CSF, DORA, PCI DSS, SOC 2, CMMC, FedRAMP, and 21 more
- Bidirectional framework mapping and gap analysis
- Import your purchased standards for official text
- **Install:** `pipx install security-controls-mcp`

### How They Work Together

**Regulations → Controls Implementation Workflow:**

```
1. "What are DORA's ICT risk management requirements?"
   → EU Regulations MCP returns Article 6 full text

2. "What security controls satisfy DORA Article 6?"
   → Security Controls MCP maps to ISO 27001, NIST CSF, and SCF controls

3. "Show me ISO 27001 A.8.1 implementation details"
   → Security Controls MCP returns control requirements and framework mappings
```

**Complete compliance in one chat:**
- **EU/US Regulations MCPs** tell you WHAT compliance requirements you must meet
- **Security Controls MCP** tells you HOW to implement controls that satisfy those requirements

### Specialized: OT/ICS Security

### 🏭 [OT Security MCP](https://github.com/Ansvar-Systems/ot-security-mcp)
**Query IEC 62443, NIST 800-82/53, and MITRE ATT&CK for ICS**
- Specialized for OT/ICS environments (manufacturing, energy, critical infrastructure)
- Security levels, Purdue Model, zone/conduit architecture
- MITRE ATT&CK for ICS threat intelligence
- **Install:** `npx @ansvar/ot-security-mcp`
- **Use case:** NIS2-compliant OT operators, industrial manufacturers, critical infrastructure

### Specialized: Automotive Cybersecurity

### 🚗 [Automotive Cybersecurity MCP](https://github.com/Ansvar-Systems/Automotive-MCP)
**Query UNECE R155/R156 and ISO 21434**
- Complete R155/R156 Revision 2 with all articles and annexes
- ISO 21434 clause guidance and work products
- R155 ↔ ISO 21434 cross-references
- **Install:** `npx @ansvar/automotive-cybersecurity-mcp`
- **Use case:** OEMs, Tier 1/2 suppliers, type approval preparation

### Specialized: Sanctions Screening

### 🚨 [Sanctions MCP](https://github.com/Ansvar-Systems/Sanctions-MCP)
**Offline-capable sanctions screening for third-party risk**
- OFAC, EU, UN sanctions lists via OpenSanctions (30+ lists)
- Fuzzy name matching with confidence scoring
- PEP (Politically Exposed Person) checks
- **Install:** `pip install ansvar-sanctions-mcp`
- **Use case:** DORA Article 28 ICT third-party risk, AML/KYC compliance

---

## About Ansvar Systems

We build AI-accelerated threat modeling and compliance tools for automotive, financial services, and healthcare. This MCP server started as our internal reference tool — turns out everyone building for EU markets has the same EUR-Lex frustrations.

So we're open-sourcing it. Navigating 37 regulations shouldn't require a legal team.

**[ansvar.eu](https://ansvar.eu)** — Stockholm, Sweden

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
