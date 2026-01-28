# EU Compliance MCP - Coverage Gaps & Roadmap

## Current Coverage (v0.4.0)

✅ **What works:**
- 37 base regulations (full text)
- 2,278 articles with structured data
- 1,145 official definitions
- 3,508 recitals from 33/37 regulations (full coverage)
- 686 security framework mappings (ISO 27001, NIST CSF 2.0)
- 305 sector applicability rules
- Full-text search across all content (articles + recitals)
- Cross-regulation comparisons
- Pre-built database with all data (no runtime EUR-Lex access needed)

---

## ✅ EUR-Lex WAF Resolution (v0.4.0)

**Problem:** EUR-Lex deployed AWS WAF JavaScript challenge that blocked all automated ingestion scripts (discovered 2026-01-27)

**Solution:** Puppeteer + Pre-built Database Architecture

**Implementation:**
1. **Puppeteer integration** - Headless Chrome executes JavaScript challenges, bypassing WAF
2. **Pre-built database** - All 37 regulations + 3,508 recitals pre-ingested at build time
3. **npm package distribution** - Database ships with package (no runtime EUR-Lex access needed)
4. **Maintainer-only ingestion** - Fresh data fetched during CI/CD, not by end users

**Benefits:**
- ✅ Users get instant access to complete dataset (no network calls)
- ✅ Consistent data across all installations
- ✅ No EUR-Lex availability dependency at runtime
- ✅ Daily monitoring continues via GitHub Actions with Puppeteer

**Trade-offs:**
- Package size increased (~15MB with database)
- Fresh data requires new npm release
- Ingestion slower (~2-3s per regulation vs 200ms)

**Technical details:** See `scripts/browser-fetcher.ts` for Puppeteer implementation

---

## Known Gaps

### 1. Recitals ✅ (Complete as of v0.4.0)

**Status:** ✅ Complete - Full recitals coverage achieved

**Coverage:**
- 3,508 recitals from 33/37 regulations
- Top regulations by recital count:
  - EECC: 325 recitals
  - AI Act: 180 recitals
  - GDPR: 173 recitals
  - MiFID II: 170 recitals
  - DSA: 155 recitals
  - NIS2: 144 recitals
  - CRA: 130 recitals

**Missing recitals (4 regulations):**
- UN-R155, UN-R156: UNECE regulations don't have EU-style recitals
- PLD, CSDDD: Recent directives, verification pending

**What's working:**
- ✅ Database schema (recitals table + FTS5 search)
- ✅ `get_recital` MCP tool implementation
- ✅ Enhanced `search_regulations` includes recitals
- ✅ Full-text search across all recitals
- ✅ Pre-built database ships with npm package

**Test queries:**
```
✅ "What's GDPR Recital 83?" (encryption and technical measures)
✅ "Get AI Act Recital 1" (sets out purpose and scope)
✅ "Show me NIS2 Recital 2" (builds on NIS1 Directive)
✅ Search for "encryption" finds recitals across multiple regulations
```

**Why this matters:**
Auditors, lawyers, and compliance officers use recitals to interpret vague requirements. Example:
- GDPR Article 32: "appropriate technical and organisational measures"
- Recital 83 clarifies: encryption, pseudonymization, resilience, restoration capabilities

---

### 2. Delegated Acts & Technical Standards ❌ (Medium Priority)

**What's missing:**
- **DORA**: RTS/ITS from EBA/EIOPA/ESMA on ICT risk management
- **AI Act**: Codes of practice, harmonized standards
- **NIS2**: Implementing acts on incident notification formats
- **MiCA**: Technical standards on crypto-asset service providers
- **eIDAS 2.0**: Implementing acts on trust service providers

**Test queries that fail:**
```
❌ "What are the exact fields required in a DORA incident report?"
❌ "What technical standards apply to high-risk AI systems?"
❌ "Show me the DORA RTS on ICT risk management framework"
❌ "What's the format for NIS2 incident notifications?"
```

**Why this matters:**
Base regulations say "you must report incidents." Delegated acts say "here's the form."

**Example:**
- DORA Article 19: Must report incidents (what)
- DORA RTS: 14 mandatory fields, timeline, classification criteria (how)

**Complexity:**
- Published separately from base regulations
- Often delayed (AI Act passed 2024, harmonized standards TBD)
- Multiple ESAs publish different RTS for same regulation

**Roadmap:** v0.5.0 (next priority after recitals completion)

---

### 3. National Transpositions ❌ (Low Priority for v1.0)

**What's missing:**
- Member state implementations of directives
- National penalty regimes
- Country-specific deviations

**Directives that need transposition:**
- NIS2 (varies significantly by country)
- ePrivacy (27 different versions)
- LED (Law Enforcement Directive)

**Test queries that fail:**
```
❌ "How does Germany implement NIS2?"
❌ "What are the NIS2 penalties in France vs Netherlands?"
❌ "Show me Sweden's national cybersecurity authority requirements"
```

**Why this matters:**
- Regulations (GDPR, DORA) apply directly across EU
- Directives (NIS2, ePrivacy) are transposed into 27 national laws
- Penalties can vary 10x between member states

**Complexity:**
- 27 languages × multiple directives = massive scope
- National laws live on different portals
- Requires monitoring 27+ legislative sources

**Roadmap:** Post-v1.0, community contributions (one country at a time)

---

### 4. Amendments & Versioning ⚠️ (Partial Coverage)

**What works:**
- Daily EUR-Lex monitoring detects changes
- `source_registry` table tracks last update per regulation
- Auto-update workflow can re-ingest on changes

**What's missing:**
- No historical versions (only current)
- No amendment changelog (what changed when)
- No corrigenda tracking (official corrections)

**Test queries that partially work:**
```
✅ "When was this regulation data last updated?"
   → Can query source_registry.last_fetched

⚠️ "Has GDPR been amended since 2018?"
   → Can check eur_lex_version date, but no diff

❌ "What changed in the EU AI Act between passage and final version?"
   → No historical versions stored
```

**Why this matters:**
- Regulations get amended (GDPR amended 2018 → 2020 → 2023)
- Corrigenda fix typos/errors in Official Journal
- Compliance teams need to know what changed

**Roadmap:** v0.6.0 (after delegated acts)

---

### 5. Cross-References & Dependencies ⚠️ (Partial)

**What works:**
- Articles mention other regulations in text
- Search can find cross-references
- `compare_requirements` tool shows side-by-side

**What's missing:**
- No structured graph of dependencies
- Can't query "what regulations reference GDPR Article 6?"
- No "this regulation overrides that one" tracking

**Test queries that fail:**
```
❌ "Which regulations reference GDPR Article 6 (lawful basis)?"
❌ "Does DORA override NIS2 for financial institutions?"
❌ "Show me all regulations that cite the Cybersecurity Act"
```

**Why this matters:**
- DORA explicitly overrides NIS2 for financial entities
- AI Act references GDPR 30+ times
- Understanding precedence matters for compliance

**Roadmap:** v0.7.0 (requires NLP/graph analysis)

---

## Freshness Verification Queries

These queries **work today** because of `source_registry`:

```
✅ "When was DORA data last fetched?"
   → Query: SELECT last_fetched FROM source_registry WHERE regulation = 'DORA'

✅ "What's the EUR-Lex version date for GDPR?"
   → Query: SELECT eur_lex_version FROM source_registry WHERE regulation = 'GDPR'

✅ "Are all regulations up to date?"
   → Check quality_status column, compare to EUR-Lex
```

## Testing Matrix

| Category | Test Query | Expected Result | Actual Result |
|----------|-----------|-----------------|---------------|
| **Base articles** | "Show me DORA Article 17" | Full text | ✅ Works |
| **Definitions** | "What does NIS2 define as 'essential entity'?" | Official definition | ✅ Works |
| **Search** | "Find all articles mentioning encryption" | FTS5 results | ✅ Works |
| **Comparisons** | "Compare DORA vs NIS2 incident timelines" | Side-by-side | ✅ Works |
| **Applicability** | "Does DORA apply to cloud providers?" | Yes/No + criteria | ✅ Works |
| **Framework mapping** | "Map ISO 27001 A.5.24 to regulations" | Related articles | ✅ Works |
| **Recitals** | "What's GDPR Recital 83?" | Recital text | ✅ Works (v0.4.0 - 3,508 recitals) |
| **Delegated acts** | "Show me DORA RTS on incident reporting" | RTS text | ❌ Not included |
| **National law** | "How does Germany implement NIS2?" | German text | ❌ Out of scope |
| **Amendments** | "What changed in GDPR since 2018?" | Changelog | ⚠️ Partial (can see date, not diff) |
| **Cross-refs** | "Which regs reference GDPR Article 6?" | List of regs | ❌ No graph |

## Prioritization Rationale

**v0.4.0 - Recitals:** ✅ Complete
- High user value (interpretation guidance)
- Moderate complexity (required Puppeteer to bypass WAF)
- 3,508 recitals across 33/37 regulations

**v0.5.0 - Delegated Acts:**
- High value for practitioners
- Medium complexity (multiple sources: EBA, EIOPA, ESMA, Commission)
- Requires new ingestion pipelines

**v0.6.0 - Amendment Tracking:**
- Moderate value (mostly for legal teams)
- High complexity (need diff algorithms, version storage)
- Large storage increase

**Post-v1.0 - National Transpositions:**
- Very high value for country-specific compliance
- Extremely high complexity (27 countries, multiple languages)
- Best suited for community contributions

**Post-v1.0 - Dependency Graphs:**
- Moderate value (nice-to-have)
- High complexity (requires NLP/semantic analysis)
- Research project territory

## How to Test

Run these queries against the MCP to verify boundaries:

```bash
# Start MCP server
npm run dev

# Test via Claude Desktop or:
npx @modelcontextprotocol/inspector
```

**Copy-paste test queries from each category above.**

This helps you:
1. Demo confidently (know what works)
2. Set expectations (know what doesn't)
3. Prioritize features (user feedback on gaps)

## Contributing

If you want to help fill these gaps:

**Delegated Acts (v0.5.0):**
- Create `delegated_acts` table
- New ingestion script for ESA websites
- Track parent regulation relationships

**National Transpositions (community):**
- Pick one country + one directive (e.g., Swedish NIS2)
- Document national source (e.g., Swedish Code of Statutes)
- Create ingestion script for that source
- Repeat for other countries

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.
