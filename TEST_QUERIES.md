# EU Compliance MCP - Test Queries

Use these queries to test the MCP server and understand its capabilities.

## ✅ Queries That Work

### Basic Article Lookups

```
"What is DORA Article 17?"
"Show me GDPR Article 32"
"Get the full text of AI Act Article 6"
"What does NIS2 Article 23 say about incident reporting?"
```

### Regulation Structure

```
"List all articles in the Cyber Resilience Act"
"Show me the structure of DORA"
"How many articles are in the EU AI Act?"
"What chapters does MiFID II have?"
```

### Definitions

```
"What does NIS2 define as an 'essential entity'?"
"How does the EU AI Act define 'high-risk AI system'?"
"What's the DORA definition of 'ICT-related incident'?"
"Show me all definitions in the Data Act"
"What does GDPR mean by 'personal data breach'?"
```

### Cross-Regulation Comparisons

```
"Compare incident reporting timelines across DORA, NIS2, and GDPR"
"What's the difference between DORA and NIS2 risk management requirements?"
"How do breach notification requirements differ between GDPR and NIS2?"
"Compare penalties across GDPR, DORA, and AI Act"
```

### Full-Text Search

```
"Search for 'encryption' across all regulations"
"Find articles about third-party risk management"
"What regulations mention incident response?"
"Search for 'penetration testing' requirements"
"Find all references to cloud service providers"
```

### Applicability Checks

```
"Which regulations apply to a Swedish fintech startup with 30 employees?"
"Does DORA apply to a cloud provider serving banks?"
"Is my HR chatbot covered by the EU AI Act?"
"Which regulations apply to a medical device manufacturer?"
"What compliance obligations does a payment processor have?"
"Do IoT device makers need to comply with the CRA?"
```

### ISO 27001 Mappings

```
"Which EU regulations require access control measures?"
"Map ISO 27001 A.5.24 (incident management) to EU regulations"
"What EU requirements cover business continuity planning?"
"Show me all regulations related to ISO 27001 A.8.1 (user endpoint devices)"
"Which GDPR articles map to ISO 27001 controls?"
```

### NIST CSF Mappings

```
"What EU regulations relate to NIST CSF Identify function?"
"Map NIST CSF PR.AC-1 (identity management) to regulations"
"Which regulations cover NIST CSF Detect function?"
```

### Realistic Compliance Scenarios

```
"I'm building a credit scoring API for EU banks - what do I need to comply with?"
"We had a data breach affecting 10,000 customers - what are our reporting obligations?"
"Our SaaS serves hospitals in Germany - which regulations apply?"
"We're launching an AI-powered recruitment tool in France - what's the compliance checklist?"
"We process payments for e-commerce - what financial regulations apply?"
```

### Sector-Specific Queries

**Fintech:**
```
"What are the DORA requirements for third-party ICT risk?"
"How does PSD2 define strong customer authentication?"
"What incident reporting obligations do crypto exchanges have under MiCA?"
```

**Healthcare:**
```
"What are the GDPR requirements for health data processing?"
"How does the Medical Device Regulation (MDR) address cybersecurity?"
"What EHDS requirements apply to health apps?"
```

**AI/ML:**
```
"Is my chatbot high-risk under the EU AI Act?"
"What transparency requirements apply to AI systems?"
"How do I classify my AI system under the AI Act?"
```

**IoT/Devices:**
```
"What cybersecurity requirements does the CRA impose on smart home devices?"
"Do fitness trackers need CE marking under the Radio Equipment Directive?"
"What are the UN R155 requirements for connected vehicles?"
```

### Penalties & Enforcement

```
"What are the GDPR penalties for non-compliance?"
"What fines can DORA impose?"
"What enforcement mechanisms exist under NIS2?"
```

### Freshness Checks

```
"When was the DORA data last updated?"
"What's the EUR-Lex version date for GDPR?"
"Show me the data freshness for all regulations"
```

---

## ❌ Queries That Don't Work (Yet)

These expose known gaps. See [COVERAGE_GAPS.md](./COVERAGE_GAPS.md) for roadmap.

### Recitals (v0.3.0)

```
❌ "What's the legislative intent behind GDPR Article 32?"
❌ "How should I interpret 'appropriate technical measures' in DORA Article 16?"
❌ "What guidance does the AI Act give on proportionality in risk assessments?"
❌ "Why did the EU legislature include Article 17 in DORA?"
❌ "What's the policy objective behind NIS2 essential entities classification?"
```

**Why they fail:** Recitals column exists but is empty (not ingested yet).

### Delegated Acts & Technical Standards (v0.4.0)

```
❌ "What are the exact fields required in a DORA incident report?"
❌ "What technical standards apply to high-risk AI systems under the AI Act?"
❌ "Show me the DORA RTS on ICT risk management framework"
❌ "What's the EBA technical standard for ICT third-party monitoring?"
❌ "What are the harmonized standards for CE marking under the CRA?"
❌ "Show me the NIS2 implementing act on incident notification formats"
```

**Why they fail:** Delegated/implementing acts are published separately and not included.

### National Transpositions (Post-v1.0)

```
❌ "How does Germany implement NIS2?"
❌ "What's the Swedish version of the ePrivacy Directive?"
❌ "Are the NIS2 penalties the same in France and Netherlands?"
❌ "Which German authority enforces GDPR?"
❌ "Show me Spain's national cybersecurity requirements"
```

**Why they fail:** Out of scope (27 countries × multiple languages).

### Amendment History (v0.5.0)

```
❌ "What changed in GDPR between 2018 and 2023?"
❌ "Has the EU AI Act been amended since passage?"
❌ "Show me the changelog for DORA"
❌ "What corrections were published for NIS2?"
```

**Why they fail (mostly):** Only current version stored, no historical diff.

⚠️ **Partial:** "When was GDPR last updated?" works (checks `eur_lex_version` date).

### Cross-Reference Graphs (Post-v1.0)

```
❌ "Which regulations reference GDPR Article 6?"
❌ "Does DORA override NIS2 for financial institutions?"
❌ "Show me all regulations that cite the Cybersecurity Act"
❌ "What's the dependency tree for AI Act compliance?"
```

**Why they fail:** No structured dependency graph.

---

## 🧪 How to Test

### Option 1: Claude Desktop

1. Install MCP server:
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

2. Restart Claude Desktop

3. Copy-paste queries from the "✅ Queries That Work" section

### Option 2: MCP Inspector

```bash
npm install -g @modelcontextprotocol/inspector
npx @modelcontextprotocol/inspector npx @ansvar/eu-regulations-mcp
```

Open the inspector UI and test queries interactively.

### Option 3: Development Mode

```bash
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP
cd EU_compliance_MCP
npm install
npm run dev
```

Connect via MCP client and test.

---

## 📊 Coverage Summary

| Category | Status | Count | Notes |
|----------|--------|-------|-------|
| Base Regulations | ✅ Complete | 37 | All EUR-Lex texts |
| Articles | ✅ Complete | 2,278 | Full text + metadata |
| Definitions | ✅ Complete | 1,145 | Official definitions |
| Framework Mappings | ✅ Complete | 686 | ISO 27001, NIST CSF |
| Applicability Rules | ✅ Complete | 305 | Sector-based |
| Recitals | ❌ Missing | 0 | v0.3.0 |
| Delegated Acts | ❌ Missing | 0 | v0.4.0 |
| National Laws | ❌ Out of scope | 0 | Post-v1.0 |
| Historical Versions | ⚠️ Partial | N/A | Current only |

---

## 💡 Tips for Effective Queries

**Do:**
- Use plain English: "What are the DORA incident reporting requirements?"
- Be specific: "Compare GDPR Article 32 to NIS2 Article 21"
- Leverage tools: "Map ISO 27001 A.5.1 to regulations"

**Don't:**
- Use CELEX numbers in questions (the MCP understands regulation names)
- Ask for recitals/delegated acts (not yet available)
- Expect national law variations (directives are EU-level only)

**Pro Tips:**
- Combine tools: Search → Get Article → Compare
- Use applicability first: "What applies to me?" → then dive into specifics
- Check freshness: "When was [regulation] last updated?"

---

## 🐛 Found a Bug?

If a query in the "✅ Works" section fails, please [open an issue](https://github.com/Ansvar-Systems/EU_compliance_MCP/issues) with:
- The exact query you ran
- Expected vs actual result
- Your MCP server version (`npm view @ansvar/eu-regulations-mcp version`)

## 🚀 Want a Feature?

If you need something from the "❌ Doesn't Work" section urgently:
- Check [COVERAGE_GAPS.md](./COVERAGE_GAPS.md) for roadmap timing
- Comment on existing issues or create a new one
- Consider contributing! See [CONTRIBUTING.md](./CONTRIBUTING.md)
