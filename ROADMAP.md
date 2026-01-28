# EU Regulations MCP - Roadmap

## Current Status: v0.4.2

### ✅ Completed Features

**Core Database (v0.4.0-0.4.2):**
- ✅ 37 EU regulations with full text
- ✅ 2,438 articles + 3,712 recitals + 1,138 definitions
- ✅ Full-text search with SQLite FTS5
- ✅ ISO 27001:2022 control mappings (313 mappings)
- ✅ NIST CSF 2.0 control mappings (373 mappings)
- ✅ Sector applicability rules (305 rules)

**Infrastructure (v0.4.1-0.4.2):**
- ✅ Azure hosted service with scale-to-zero
- ✅ Daily EUR-Lex freshness monitoring
- ✅ CI/CD deployment via GitHub Actions
- ✅ REST API with PostgreSQL support

---

## Validation Phase: Delegated Acts & Technical Standards (v0.5.0)

### Overview

We're evaluating support for **delegated acts and technical standards** to provide deeper regulatory implementation guidance.

### Potential Scope

**EBA/EIOPA/ESMA Technical Standards:**
- Regulatory Technical Standards (RTS)
- Implementing Technical Standards (ITS)
- Guidelines and recommendations

**Commission Delegated Regulations:**
- Detailed requirements for specific sectors
- Technical annexes and specifications

**Implementing Acts:**
- Notification templates (NIS2)
- Reporting formats (DORA)
- Certification schemes (CRA, AI Act)

**Harmonized Standards:**
- AI Act conformity assessment standards
- Cyber Resilience Act security requirements
- Medical Device Regulation (MDR/IVDR) standards

### Example Queries This Would Enable

```
"Show me DORA incident reporting RTS (EBA/2024/XXX)"
"AI Act harmonized standards for cybersecurity"
"NIS2 implementing act notification templates"
"EIOPA guidelines on ICT risk management under DORA"
```

### Why This Needs Validation

**Challenges:**
1. **Volume:** Thousands of technical standards across sectors
2. **Maintenance:** Standards update frequently (monthly/quarterly)
3. **Licensing:** Some harmonized standards have copyright restrictions
4. **Relevance:** Not all users need this level of detail

### 📊 Your Input Shapes the Roadmap

We need to understand:
- Which technical standards matter most to your work
- Whether delegated acts justify the maintenance burden
- If harmonized standards (with licensing complexity) are worth pursuing

**Survey launching Q1 2026** after v0.4.2 stabilizes.

---

## Long-Term Vision (v1.0+)

### Cross-Jurisdictional Comparison
- UK GDPR, UK DORA equivalents
- US state privacy laws (CCPA, CPRA, etc.)
- Canadian PIPEDA, Australian Privacy Act

### Enhanced Tooling
- Gap analysis between regulations
- Compliance checklists by industry
- Risk assessment templates

### Integration Ecosystem
- Jira/Linear integration for compliance tracking
- Slack/Teams notifications for regulation updates
- Automated compliance report generation

---

## Contributing

Have ideas for the roadmap? Open a [GitHub Discussion](https://github.com/Ansvar-Systems/EU_compliance_MCP/discussions) or [Issue](https://github.com/Ansvar-Systems/EU_compliance_MCP/issues).

Built by [Ansvar Systems](https://ansvar.ai) - Stockholm, Sweden
