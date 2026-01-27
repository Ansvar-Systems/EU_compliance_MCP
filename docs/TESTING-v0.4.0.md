# Testing Guide: EU Regulations MCP Server v0.4.0

**Date:** 2026-01-27
**Version:** 0.4.0
**Purpose:** Verification testing for pre-built database architecture with complete recitals

---

## Overview

This guide provides comprehensive testing procedures for the EU Regulations MCP server v0.4.0, which introduces:
- Pre-built 17MB SQLite database (no user build required)
- 3,508 recitals from 33/37 regulations
- Puppeteer-based EUR-Lex WAF bypass (maintainer-only)
- Zero-setup user experience

---

## Installation Testing

### Test 1: Fresh Install from npm

**Objective:** Verify the package installs correctly with pre-built database

```bash
# Create test directory
mkdir -p /tmp/eu-mcp-test
cd /tmp/eu-mcp-test

# Install from npm
npm install @ansvar/eu-regulations-mcp@0.4.0

# Verify database exists
ls -lh node_modules/@ansvar/eu-regulations-mcp/data/regulations.db

# Expected output:
# -rw-r--r--  1 user  staff   17M Jan 27 11:00 regulations.db
```

**Success Criteria:**
- ✅ Installation completes in < 30 seconds
- ✅ No build scripts run (no "Building database..." messages)
- ✅ Database file present at expected location
- ✅ Database size approximately 17MB

---

## MCP Server Configuration Testing

### Test 2: Claude Desktop Integration

**Objective:** Verify MCP server works with Claude Desktop

**Step 1: Configure Claude Desktop**

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "eu-regulations": {
      "command": "npx",
      "args": [
        "-y",
        "@ansvar/eu-regulations-mcp@0.4.0"
      ]
    }
  }
}
```

**Step 2: Restart Claude Desktop**

```bash
# Kill Claude Desktop if running
pkill -f "Claude"

# Restart Claude Desktop
open -a "Claude"
```

**Step 3: Verify Connection**

In Claude Desktop, look for:
- 🔌 MCP server icon in the bottom toolbar
- "eu-regulations" server listed in MCP servers panel
- 8 tools available (if you click on the MCP icon)

**Success Criteria:**
- ✅ Server connects without errors
- ✅ All 8 tools visible: search_regulations, get_article, get_recital, list_regulations, get_definitions, check_applicability, map_controls, compare_requirements
- ✅ No error messages in Claude Desktop logs

---

## Functional Testing: Core Features

### Test 3: Search Regulations (Articles + Recitals)

**Query in Claude Desktop:**
```
Search EU regulations for "incident notification" and show both articles and recitals.
```

**Expected Response:**
- Returns mixed results (articles and recitals)
- Articles appear first (binding requirements)
- Recitals appear second (legislative intent)
- Results from multiple regulations (NIS2, DORA, CER, etc.)
- Each result shows:
  - Regulation name
  - Type (article or recital)
  - Number
  - Text snippet with "incident notification" highlighted

**Verification:**
```sql
-- Manual verification via sqlite3
sqlite3 node_modules/@ansvar/eu-regulations-mcp/data/regulations.db

-- Count articles matching
SELECT COUNT(*) FROM articles_fts WHERE articles_fts MATCH 'incident AND notification';
-- Expected: 20-30 results

-- Count recitals matching
SELECT COUNT(*) FROM recitals_fts WHERE recitals_fts MATCH 'incident AND notification';
-- Expected: 10-20 results
```

**Success Criteria:**
- ✅ Returns both articles and recitals
- ✅ Articles prioritized first
- ✅ Multiple regulations represented
- ✅ Snippets show context around search term

---

### Test 4: Get Specific Article

**Query in Claude Desktop:**
```
Show me GDPR Article 33 (personal data breach notification).
```

**Expected Response:**
- Full text of GDPR Article 33
- Title: "Notification of a personal data breach to the supervisory authority"
- Complete article text with all paragraphs
- Regulation: GDPR
- Article number: 33

**Verification:**
```sql
sqlite3 node_modules/@ansvar/eu-regulations-mcp/data/regulations.db
SELECT regulation, article_number, title, length(text)
FROM articles
WHERE regulation='GDPR' AND article_number='33';

-- Expected output:
-- GDPR|33|Notification of a personal data breach...|~2000
```

**Success Criteria:**
- ✅ Correct article returned
- ✅ Complete text (not truncated)
- ✅ Title matches EUR-Lex
- ✅ No "Article not found" errors

---

### Test 5: Get Recital (New Feature v0.4.0)

**Query in Claude Desktop:**
```
What does GDPR Recital 83 say about encryption?
```

**Expected Response:**
- Full text of GDPR Recital 83
- Mentions encryption, pseudonymization, and confidentiality
- Regulation: GDPR
- Recital number: 83

**Try Multiple Regulations:**
```
Show me:
1. AI Act Recital 1 (high-level policy objectives)
2. NIS2 Recital 2 (scope and essential entities)
3. DORA Recital 50 (ICT third-party risk management)
4. EECC Recital 1 (telecom regulatory framework)
```

**Verification:**
```sql
-- Check GDPR Recital 83
SELECT regulation, recital_number, length(text)
FROM recitals
WHERE regulation='GDPR' AND recital_number=83;
-- Expected: GDPR|83|~500

-- Check total recitals
SELECT COUNT(*) FROM recitals;
-- Expected: 3508

-- Check regulations with recitals
SELECT regulation, COUNT(*) as count
FROM recitals
GROUP BY regulation
ORDER BY count DESC
LIMIT 10;
-- Expected: EECC (325), AI_ACT (180), GDPR (173), etc.
```

**Success Criteria:**
- ✅ GDPR recitals work (v0.3.1 baseline)
- ✅ AI Act recitals work (new in v0.4.0)
- ✅ NIS2 recitals work (new in v0.4.0)
- ✅ DORA recitals work (new in v0.4.0)
- ✅ Returns null for regulations without recitals (UN-R155, UN-R156)

---

### Test 6: List Regulations

**Query in Claude Desktop:**
```
List all EU regulations available in the database.
```

**Expected Response:**
- 37 regulations listed
- Each with ID, full name, and CELEX number
- Categories: Cybersecurity, Financial, Healthcare, Automotive, etc.
- Shows GDPR, NIS2, DORA, AI Act, CRA, etc.

**Verification:**
```sql
SELECT COUNT(*) FROM regulations;
-- Expected: 37

SELECT id, full_name FROM regulations ORDER BY id LIMIT 5;
-- Expected: AI_ACT, AIFMD, CBAM, CER, CRA...
```

**Success Criteria:**
- ✅ All 37 regulations listed
- ✅ Correct names and CELEX IDs
- ✅ No duplicates
- ✅ Sorted alphabetically by ID

---

### Test 7: Get Definitions

**Query in Claude Desktop:**
```
Define "personal data" according to GDPR.
```

**Expected Response:**
- Term: "personal data"
- Definition: "...any information relating to an identified or identifiable natural person..."
- Source: GDPR Article 4
- Regulation: GDPR

**Try Multiple Terms:**
```
What do these regulations define as:
1. "incident" (NIS2, DORA)
2. "AI system" (AI Act)
3. "critical entity" (CER)
```

**Verification:**
```sql
-- Check GDPR definition
SELECT term, definition, article
FROM definitions
WHERE regulation='GDPR' AND term='personal data';

-- Count total definitions
SELECT COUNT(*) FROM definitions;
-- Expected: 1145

-- Definitions per regulation
SELECT regulation, COUNT(*) as count
FROM definitions
GROUP BY regulation
ORDER BY count DESC
LIMIT 10;
```

**Success Criteria:**
- ✅ GDPR definitions work
- ✅ Multiple regulations supported
- ✅ Term matching case-insensitive
- ✅ Full definition text returned

---

### Test 8: Check Applicability

**Query in Claude Desktop:**
```
Which EU regulations apply to a healthcare organization in Germany?
```

**Expected Response:**
- GDPR (data protection)
- NIS2 (healthcare sector is essential entity)
- MDR (medical device manufacturers)
- IVDR (in vitro diagnostic manufacturers)
- EHDS (European Health Data Space)
- Possibly others based on specifics

**Try Other Sectors:**
```
Check applicability for:
1. A bank in France (financial sector)
2. An energy company in Spain (critical infrastructure)
3. A digital service provider in Italy (DSA/DMA)
```

**Verification:**
```sql
-- Healthcare applicability
SELECT regulation, sector, subsector, applies, confidence
FROM applicability_rules
WHERE sector='healthcare';

-- Total rules
SELECT COUNT(*) FROM applicability_rules;
-- Expected: 305
```

**Success Criteria:**
- ✅ Correct sectors identified
- ✅ Confidence levels provided (definite, likely, possible)
- ✅ Basis articles cited
- ✅ Multiple sectors testable

---

### Test 9: Map Controls (ISO 27001 & NIST CSF)

**Query in Claude Desktop:**
```
Which EU regulation articles satisfy ISO 27001 control A.5.1 (policies for information security)?
```

**Expected Response:**
- Lists articles from multiple regulations (GDPR, NIS2, DORA, etc.)
- Shows coverage type (full, partial, related)
- Includes article numbers and brief descriptions

**Try NIST CSF:**
```
Map NIST CSF 2.0 function PR.AC-1 (Identity Management) to EU regulations.
```

**Verification:**
```sql
-- ISO 27001 mappings
SELECT COUNT(*)
FROM control_mappings
WHERE framework='ISO27001';
-- Expected: 313

-- NIST CSF mappings
SELECT COUNT(*)
FROM control_mappings
WHERE framework='NIST_CSF';
-- Expected: 373

-- Specific control
SELECT regulation, articles, coverage
FROM control_mappings
WHERE framework='ISO27001' AND control_id='A.5.1';
```

**Success Criteria:**
- ✅ ISO 27001:2022 controls mapped
- ✅ NIST CSF 2.0 controls mapped
- ✅ Multiple regulations per control
- ✅ Coverage types accurate

---

### Test 10: Compare Requirements

**Query in Claude Desktop:**
```
Compare incident notification requirements between NIS2 and DORA.
```

**Expected Response:**
- Side-by-side comparison
- NIS2 requirements (24 hours, significant incidents)
- DORA requirements (major incidents, detailed timeline)
- Key differences highlighted
- Relevant articles cited

**Try Other Comparisons:**
```
Compare:
1. Risk assessment requirements (NIS2, DORA, CRA)
2. Personal data handling (GDPR, LED, ePrivacy)
3. AI governance (AI Act, GDPR, DSA)
```

**Success Criteria:**
- ✅ Both regulations analyzed
- ✅ Common themes identified
- ✅ Differences highlighted
- ✅ Articles properly cited

---

## Performance Testing

### Test 11: Search Performance

**Objective:** Verify FTS5 search is fast

```sql
-- Benchmark search speed
.timer on
SELECT COUNT(*) FROM articles_fts WHERE articles_fts MATCH 'security';
-- Expected: < 50ms

SELECT COUNT(*) FROM recitals_fts WHERE recitals_fts MATCH 'security';
-- Expected: < 50ms
```

**Claude Desktop Query:**
```
Search for "cybersecurity requirements" in all regulations.
```

**Success Criteria:**
- ✅ Response time < 2 seconds
- ✅ FTS5 queries < 100ms
- ✅ No timeout errors
- ✅ Results properly ranked

---

### Test 12: Database Size & Memory

**Objective:** Verify database doesn't cause memory issues

```bash
# Check database size
ls -lh node_modules/@ansvar/eu-regulations-mcp/data/regulations.db
# Expected: ~17MB

# Check database integrity
sqlite3 node_modules/@ansvar/eu-regulations-mcp/data/regulations.db "PRAGMA integrity_check;"
# Expected: ok

# Check memory usage during queries
time sqlite3 node_modules/@ansvar/eu-regulations-mcp/data/regulations.db "SELECT COUNT(*) FROM articles_fts WHERE articles_fts MATCH 'security';"
# Expected: < 0.1s, < 50MB memory
```

**Success Criteria:**
- ✅ Database integrity intact
- ✅ Memory usage reasonable (< 100MB)
- ✅ No corruption warnings
- ✅ File size matches expectations

---

## Edge Case Testing

### Test 13: Missing Recitals (4 regulations)

**Query in Claude Desktop:**
```
Show me UN-R155 Recital 1.
```

**Expected Response:**
- Returns null or "Not found"
- Explanation that UN regulations don't have EU-style recitals

**Try Others:**
```
Check recitals for:
1. UN-R156 (no recitals - UNECE format)
2. EIDAS2 (no recitals - consolidated version parsing issue)
3. EPRIVACY (no recitals - consolidated version parsing issue)
```

**Verification:**
```sql
-- Check which regulations have no recitals
SELECT r.id, r.full_name
FROM regulations r
LEFT JOIN recitals rec ON r.id = rec.regulation
WHERE rec.regulation IS NULL;
-- Expected: 4 regulations (UN_R155, UN_R156, plus 2 pending verification)
```

**Success Criteria:**
- ✅ Gracefully returns null (not error)
- ✅ Clear message about missing data
- ✅ Other regulations still work
- ✅ No database corruption

---

### Test 14: Large Query Results

**Query in Claude Desktop:**
```
Search for "the" in all regulations.
```

**Expected Response:**
- Returns top 20 results (default limit)
- Doesn't timeout or crash
- Results properly truncated
- Offers pagination or suggests narrowing search

**Success Criteria:**
- ✅ Handles common words gracefully
- ✅ Respects result limits
- ✅ No memory exhaustion
- ✅ Reasonable response time

---

### Test 15: Special Characters

**Query in Claude Desktop:**
```
Search for "AI/ML" in regulations.
```

**Expected Response:**
- Handles slash correctly (not regex)
- Finds relevant AI Act, DORA, NIS2 articles
- No SQL injection or parsing errors

**Success Criteria:**
- ✅ Special characters escaped
- ✅ No SQL errors
- ✅ Results accurate
- ✅ No security vulnerabilities

---

## Regression Testing (v0.3.1 Features)

### Test 16: Existing Features Still Work

**Verify all v0.3.1 features remain functional:**

1. **Article search** - `get_article` tool works
2. **Full-text search** - Articles searchable
3. **Definitions** - `get_definitions` works
4. **Applicability** - `check_applicability` works
5. **Control mappings** - `map_controls` works (ISO 27001 & NIST CSF)
6. **Regulation listing** - `list_regulations` works
7. **Comparison** - `compare_requirements` works

**Success Criteria:**
- ✅ All 7 existing tools functional
- ✅ No breaking changes
- ✅ Backward compatibility maintained
- ✅ Test suite passes (52/52 tests)

---

## Documentation Testing

### Test 17: README Accuracy

**Verify README.md claims match reality:**

```bash
# Check statistics in README
grep -E "(37 regulations|3,508 recitals|1,145 definitions)" README.md
```

**Claims to verify:**
- 37 EU regulations ✓
- 3,508 recitals ✓
- 1,145 definitions ✓
- 2,278 articles ✓
- ISO 27001 mappings (313) ✓
- NIST CSF mappings (373) ✓

**Success Criteria:**
- ✅ All statistics accurate
- ✅ No false claims (like v0.3.0)
- ✅ Examples work as documented
- ✅ Installation instructions correct

---

### Test 18: Coverage Gaps Documentation

**Verify COVERAGE_GAPS.md is accurate:**

```bash
# Check v0.4.0 status
grep "v0.4.0" docs/COVERAGE_GAPS.md

# Check recitals count
grep "3,508" docs/COVERAGE_GAPS.md
```

**Claims to verify:**
- Recitals: 3,508 from 33/37 regulations ✓
- EUR-Lex WAF resolved ✓
- Pre-built database ✓
- No false "~2,500+" claims ✓

**Success Criteria:**
- ✅ Version numbers correct
- ✅ Statistics match database
- ✅ Known limitations documented
- ✅ No outdated v0.3.0 references

---

## Load Testing (Optional)

### Test 19: Concurrent Queries

**Objective:** Verify multiple simultaneous queries don't cause issues

```bash
# Run multiple queries in parallel
for i in {1..10}; do
  sqlite3 data/regulations.db "SELECT COUNT(*) FROM recitals;" &
done
wait
```

**Claude Desktop:**
- Open multiple conversation threads
- Run queries simultaneously
- Verify no database locking errors

**Success Criteria:**
- ✅ No "database is locked" errors
- ✅ All queries complete
- ✅ Results consistent
- ✅ No corruption

---

## Security Testing

### Test 20: SQL Injection Prevention

**Objective:** Verify user input properly sanitized

**Malicious Queries:**
```
Search for: '; DROP TABLE articles; --
Get article: ' OR '1'='1
Get recital: 999999999
```

**Expected Response:**
- No SQL errors
- No data deletion
- Graceful error messages
- Queries properly escaped

**Success Criteria:**
- ✅ All malicious inputs handled
- ✅ Database integrity maintained
- ✅ No sensitive info leaked
- ✅ Proper error messages

---

## Automation Testing

### Test 21: Automated Test Suite

**Run the full test suite:**

```bash
cd /path/to/EU_compliance_MCP
npm test
```

**Expected Results:**
```
Test Files  11 passed (11)
Tests       52 passed (52)
Duration    ~8s
```

**Test Breakdown:**
- database.test.ts (8 tests)
- article.test.ts (6 tests)
- recital.test.ts (5 tests)
- definitions.test.ts (4 tests)
- search.test.ts (8 tests)
- applicability.test.ts (4 tests)
- map.test.ts (6 tests)
- compare.test.ts (5 tests)
- list.test.ts (4 tests)
- eurlex-browser.test.ts (1 test)
- version.test.ts (1 test)

**Success Criteria:**
- ✅ All 52 tests pass
- ✅ No skipped tests
- ✅ Duration < 15 seconds
- ✅ No warnings or errors

---

## Post-Publication Verification

### Test 22: npm Package Published

**After GitHub Actions completes:**

```bash
# Check npm registry
npm view @ansvar/eu-regulations-mcp@0.4.0

# Expected output:
# version: 0.4.0
# description: The first open-source MCP server for European cybersecurity regulations
# dist.tarball: https://registry.npmjs.org/@ansvar/eu-regulations-mcp/-/eu-regulations-mcp-0.4.0.tgz
```

**Verify package contents:**
```bash
npm pack @ansvar/eu-regulations-mcp@0.4.0
tar -tzf ansvar-eu-regulations-mcp-0.4.0.tgz | grep regulations.db
# Expected: package/data/regulations.db
```

**Success Criteria:**
- ✅ Published to npm
- ✅ Version 0.4.0 available
- ✅ Database included in tarball
- ✅ Download works globally

---

### Test 23: GitHub Release

**Verify GitHub release:**

1. Go to: https://github.com/Ansvar-Systems/EU_compliance_MCP/releases
2. Check v0.4.0 release exists
3. Verify release notes mention:
   - Pre-built database
   - 3,508 recitals
   - EUR-Lex WAF bypass
   - Puppeteer requirement (maintainers only)

**Success Criteria:**
- ✅ Release tagged correctly
- ✅ Release notes accurate
- ✅ Assets available (if any)
- ✅ Changelog updated

---

## Known Issues (v0.4.0)

### Expected Failures (Not Bugs)

1. **4 regulations without recitals:**
   - UN-R155, UN-R156 (UNECE format, no EU-style recitals)
   - EIDAS2, EPRIVACY (consolidated versions, parser needs enhancement)
   - **Expected behavior:** `get_recital` returns null

2. **Daily EUR-Lex freshness monitoring:**
   - Temporarily disabled due to WAF
   - Requires Puppeteer integration (future work)
   - **Expected behavior:** Workflow may show as failed

3. **Large package size:**
   - 8.7MB compressed, 29.7MB unpacked
   - 17MB database included
   - **Expected behavior:** Slower npm install than v0.3.1

---

## Testing Checklist Summary

### Core Functionality (Must Pass)
- [ ] Fresh install from npm works
- [ ] Claude Desktop integration works
- [ ] Search returns articles and recitals
- [ ] Get article works (GDPR Article 33)
- [ ] Get recital works (GDPR, AI Act, NIS2, DORA)
- [ ] List regulations shows all 37
- [ ] Get definitions works
- [ ] Check applicability works
- [ ] Map controls works (ISO 27001 & NIST CSF)
- [ ] Compare requirements works

### Performance (Should Pass)
- [ ] Search response < 2 seconds
- [ ] FTS5 queries < 100ms
- [ ] Database integrity intact
- [ ] Memory usage reasonable

### Edge Cases (Should Handle Gracefully)
- [ ] Missing recitals return null (not error)
- [ ] Large queries don't timeout
- [ ] Special characters handled correctly

### Regression (Must Pass)
- [ ] All v0.3.1 features still work
- [ ] All 52 tests pass
- [ ] No breaking changes

### Documentation (Should Match)
- [ ] README statistics accurate
- [ ] COVERAGE_GAPS.md updated to v0.4.0
- [ ] No false claims

### Security (Must Pass)
- [ ] SQL injection prevented
- [ ] No data corruption
- [ ] Proper error handling

---

## Contact & Support

**Issues:** https://github.com/Ansvar-Systems/EU_compliance_MCP/issues
**Discussions:** https://github.com/Ansvar-Systems/EU_compliance_MCP/discussions
**npm:** https://www.npmjs.com/package/@ansvar/eu-regulations-mcp

**Maintainer Testing:** For full re-ingestion tests with Puppeteer, see `docs/TASK-7-PRE-FLIGHT-CHECK.md`

---

**Version:** v0.4.0
**Last Updated:** 2026-01-27
**Status:** ✅ Ready for Testing
