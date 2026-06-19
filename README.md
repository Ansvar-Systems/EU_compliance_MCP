# EU Regulations MCP Server

<!-- ANSVAR-CTA-BEGIN -->
> ### ▶ Try this MCP instantly via Ansvar Gateway
> **100 free queries/day · no card required · OAuth signup at [ansvar.eu/gateway](https://ansvar.eu/gateway)**
>
> One endpoint, one OAuth signup, access from any MCP-compatible client.

### Connect

**Claude Code** (one line):

```bash
claude mcp add ansvar --transport http https://gateway.ansvar.eu/mcp
```

**Claude Desktop / Cursor** — add to `claude_desktop_config.json` (or `mcp.json`):

```json
{
  "mcpServers": {
    "ansvar": {
      "type": "url",
      "url": "https://gateway.ansvar.eu/mcp"
    }
  }
}
```

**Claude.ai** — Settings → Connectors → Add custom connector → paste `https://gateway.ansvar.eu/mcp`

First request opens an OAuth flow at [ansvar.eu/gateway](https://ansvar.eu/gateway). After signup, your client is bound to your account; tier (free / premium / team / company) determines fan-out, quota, and which downstream MCPs are reachable.

---

## Self-host this MCP

You can also clone this repo and build the corpus yourself. The schema,
fetcher, and tool implementations all live here. What is not in the repo is
the pre-built database — TDM and standards-licensing constraints on the
upstream sources mean we host the corpus on Ansvar infrastructure rather
than redistribute it as a public artifact.

Build your own: run this repo's ingestion script (entry-point varies per
repo — typically `scripts/ingest.sh`, `npm run ingest`, or `make ingest`;
check the repo root).
<!-- ANSVAR-CTA-END -->


MCP server providing structured access to full-text EU regulations via Claude, Cursor, and other MCP-compatible clients.

[![MCP Registry](https://img.shields.io/badge/MCP-Registry-blue)](https://registry.modelcontextprotocol.io/eu.ansvar/eu-regulations-mcp)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![GitHub stars](https://img.shields.io/github/stars/Ansvar-Systems/EU_compliance_MCP?style=social)](https://github.com/Ansvar-Systems/EU_compliance_MCP)
[![Daily EUR-Lex Check](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml/badge.svg)](https://github.com/Ansvar-Systems/EU_compliance_MCP/actions/workflows/check-updates.yml)
[![Database](https://img.shields.io/badge/database-pre--built-green)](docs/COVERAGE_GAPS.md)

Query **EU regulations** — from GDPR and AI Act to DORA, Chips Act, MiFID II, eIDAS, Medical Device Regulation, MDCG cybersecurity guidance, and more — directly from Claude, Cursor, or any MCP-compatible client.

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

- **Regulations** — GDPR, DORA, NIS2, AI Act, CRA, Chips Act, MiCA, eIDAS 2.0, Medical Device Regulation, and more
- **Articles, Recitals & Official Definitions** — full text, with individually addressable annexes
- **Regulation Guides** — Pitfalls, proportionality tiers, cross-regulation analysis, key article structures for DORA, CRA, AI Act, GDPR, NIS2, MDR, MiCA, DSA, Data Act, PLD, and more
- **Full-Text Search** — Find relevant articles and annexes across all regulations instantly
- **Control Mappings** — to ISO 27001:2022 & NIST CSF 2.0
- **Evidence Requirements** — audit artifacts across all regulations
- **Sector Rules** — applicability rules across all sectors and industries
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
- Search returns **64-token snippets** with highlighted matches (safe for context)
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
- **[Privacy Policy](PRIVACY.md)** - Data handling and retention notes

---

## Directory Review Notes

### Testing Account and Sample Data

This server is read-only and does not require a login account for functional review.
For directory review, use the bundled dataset and these sample prompts:
- *"What does NIS2 Article 21 require?"*
- *"Compare DORA and NIS2 incident reporting obligations."*
- *"Map ISO 27001 controls to DORA requirements."*

### Remote Authentication (OAuth 2.0)

The default server runtime is read-only and can be deployed without authentication.
If you deploy a remote authenticated endpoint, use OAuth 2.0 over TLS with certificates from recognized authorities.

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

## More Ansvar MCPs

Full fleet at [ansvar.eu/gateway](https://ansvar.eu/gateway).
## About Ansvar Systems

We build AI-accelerated threat modeling and compliance tools for automotive, financial services, and healthcare. This MCP server started as our internal reference tool — turns out everyone building for EU markets has the same EUR-Lex frustrations.

So we're open-sourcing it. Navigating EU regulations shouldn't require a legal team.

**[ansvar.eu](https://ansvar.eu)** — Stockholm, Sweden

---

## Documentation

- **[Coverage Details](docs/coverage.md)** — full regulation list with article counts
- **[Use Cases](docs/use-cases.md)** — Industry-specific guidance (fintech, healthcare, IoT, etc.)
- **[Available Tools](docs/tools.md)** — Detailed tool descriptions
- **[Development Guide](docs/development.md)** — Adding regulations, webhooks, CI/CD
- **[Troubleshooting](docs/troubleshooting.md)** — Common issues and fixes
- **[Roadmap](ROADMAP.md)** — Upcoming features (delegated acts, national transpositions)
- **[Coverage Gaps](docs/COVERAGE_GAPS.md)** — Known limitations
- **[Test Queries](TEST_QUERIES.md)** — 60+ example queries

---

## Branching Strategy

This repository uses a `dev` integration branch. **Do not push directly to `main`.**

```
feature-branch → PR to dev → verify on dev → PR to main → deploy
```

- `main` is production-ready. Only receives merges from `dev` via PR.
- `dev` is the integration branch. All changes land here first.
- Feature branches are created from `dev`.

## License

Apache License 2.0. See [LICENSE](./LICENSE) for details.

---

<p align="center">
  <sub>Built with care in Stockholm, Sweden</sub>
</p>
