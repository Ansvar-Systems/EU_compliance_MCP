# Comprehensive Test Suite

**Version:** 1.0.0
**Created:** 2026-01-27
**For:** EU Regulations MCP Server v0.4.0+

## Overview

This comprehensive test suite provides 150+ SOLID test cases covering:

1. **Data Quality & Integrity** - Database consistency checks
2. **Edge Cases & Error Handling** - Boundary conditions, malformed inputs
3. **Real-World Compliance Workflows** - Practical compliance scenarios
4. **Security & Input Validation** - SQL injection, path traversal, ReDoS
5. **Performance & Scalability** - Query speed, memory usage, concurrent access

## Test Files

| File | Tests | Purpose |
|------|-------|---------|
| `data-quality.test.ts` | 10 | Database integrity, referential consistency |
| `edge-cases.test.ts` | 40+ | Boundary conditions, malformed inputs |
| `compliance-workflows.test.ts` | 20+ | Real-world compliance analysis scenarios |
| `security.test.ts` | 30+ | SQL injection, XSS, ReDoS prevention |
| `performance.test.ts` | 25+ | Query benchmarks, concurrent access |

## Running Tests

### Run All Comprehensive Tests
```bash
npm test -- tests/comprehensive/
```

### Run Specific Test Suite
```bash
# Data quality only
npm test -- tests/comprehensive/data-quality.test.ts

# Edge cases only
npm test -- tests/comprehensive/edge-cases.test.ts

# Compliance workflows only
npm test -- tests/comprehensive/compliance-workflows.test.ts

# Security tests only
npm test -- tests/comprehensive/security.test.ts

# Performance tests only
npm test -- tests/comprehensive/performance.test.ts
```

### Run with Coverage
```bash
npm test -- --coverage tests/comprehensive/
```

### Run with Verbose Output
```bash
npm test -- --reporter=verbose tests/comprehensive/
```

## Test Priorities

### Priority 1: Must Pass (Critical)
- ✅ All data quality tests (10 tests)
- ✅ SQL injection prevention (7 tests)
- ✅ Core workflow tests (6 tests)
- ✅ Performance benchmarks (10 tests)

**Command:**
```bash
npm test -- tests/comprehensive/data-quality.test.ts tests/comprehensive/security.test.ts
```

### Priority 2: Should Pass (Important)
- ✅ Edge case handling (40+ tests)
- ✅ Real-world scenarios (20+ tests)

**Command:**
```bash
npm test -- tests/comprehensive/edge-cases.test.ts tests/comprehensive/compliance-workflows.test.ts
```

### Priority 3: Nice to Have (Optimization)
- ✅ Advanced security tests
- ✅ Performance optimization tests

**Command:**
```bash
npm test -- tests/comprehensive/performance.test.ts
```

## Test Structure

Each test file follows this pattern:

```typescript
describe('Test Category', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  describe('Sub-category', () => {
    it('specific test case', async () => {
      // Arrange
      const input = { ... };

      // Act
      const result = await toolFunction(db, input);

      // Assert
      expect(result).toBeDefined();
      expect(result.property).toBe(expectedValue);
    });
  });
});
```

## Key Test Scenarios

### 1. Data Quality Tests

**Ensures database integrity:**
- Articles table matches FTS5 index count
- No orphaned definitions or control mappings
- Source registry consistency
- No duplicate articles
- All regulations have articles

**Example:**
```bash
npm test -- tests/comprehensive/data-quality.test.ts
```

### 2. Edge Cases Tests

**Tests boundary conditions:**
- Extremely long search queries (2600+ chars)
- Unicode and special characters
- Empty/whitespace queries
- Invalid article numbers
- Zero/negative recital numbers
- Case sensitivity handling

**Example:**
```typescript
it('handles unicode characters correctly', async () => {
  const results = await searchRegulations(db, {
    query: 'données personnelles', // French
  });
  expect(Array.isArray(results)).toBe(true);
});
```

### 3. Compliance Workflow Tests

**Real-world scenarios:**
- Healthcare: GDPR + EHDS compliance
- Finance: DORA + NIS2 third-party risk
- AI Systems: AI Act + GDPR automated decisions
- Critical Infrastructure: NIS2 + CER resilience
- Complete workflows: search → article → recital

**Example:**
```typescript
it('identifies healthcare-specific data protection requirements', async () => {
  // 1. Check applicability
  const applicability = await checkApplicability(db, { sector: 'healthcare' });
  expect(applicability.applicable_regulations).toContain(
    expect.objectContaining({ regulation: 'GDPR' })
  );

  // 2. Search requirements
  const results = await searchRegulations(db, {
    query: 'health data processing',
    regulations: ['GDPR', 'EHDS'],
  });
  expect(results.length).toBeGreaterThan(0);
});
```

### 4. Security Tests

**Prevents attacks:**
- SQL injection in all tools
- Path traversal in regulation IDs
- Integer overflow in limits
- XSS in article text
- ReDoS in search patterns
- Database connection security

**Example:**
```typescript
it('prevents SQL injection in search queries', async () => {
  const malicious = "'; DROP TABLE articles; --";
  const results = await searchRegulations(db, { query: malicious });

  // Should not crash or execute SQL
  expect(Array.isArray(results)).toBe(true);

  // Verify tables still exist
  const count = db.prepare('SELECT COUNT(*) FROM articles').get();
  expect(count.count).toBeGreaterThan(2000);
});
```

### 5. Performance Tests

**Benchmarks:**
- FTS5 queries < 100ms
- Concurrent access (20+ parallel queries)
- Large result sets (500+ results)
- Memory usage < 50MB increase
- Database integrity under load

**Example:**
```typescript
it('searches complete dataset in under 100ms', async () => {
  const start = performance.now();
  const results = await searchRegulations(db, {
    query: 'cybersecurity',
    limit: 50,
  });
  const duration = performance.now() - start;

  expect(duration).toBeLessThan(100);
  expect(results.length).toBeGreaterThan(0);
});
```

## Expected Results

### Total Test Count
- **Existing tests:** 52 (from v0.4.0)
- **Comprehensive tests:** ~150
- **Total:** ~200 tests

### Passing Criteria
- ✅ All Priority 1 tests must pass
- ✅ 95%+ of Priority 2 tests pass
- ✅ 80%+ of Priority 3 tests pass

### Performance Benchmarks
- FTS5 search: < 100ms
- Article retrieval: < 50ms
- Control mapping: < 200ms
- Memory increase: < 50MB
- Concurrent queries: 20+ without locks

## Continuous Integration

Add to `.github/workflows/test.yml`:

```yaml
- name: Run comprehensive tests
  run: npm test -- tests/comprehensive/

- name: Run security tests
  run: npm test -- tests/comprehensive/security.test.ts

- name: Performance benchmarks
  run: npm test -- tests/comprehensive/performance.test.ts
```

## Coverage Goals

| Component | Target Coverage |
|-----------|----------------|
| Tools (src/tools/) | 90%+ |
| Database Layer | 85%+ |
| Error Handling | 95%+ |
| Edge Cases | 80%+ |

**Check coverage:**
```bash
npm test -- --coverage
```

## Troubleshooting

### Tests Failing Due to Missing Database
```bash
# Rebuild database
npm run build:db

# Verify database exists
ls -lh data/regulations.db
```

### Performance Tests Timing Out
```bash
# Run with increased timeout
npm test -- --testTimeout=30000 tests/comprehensive/performance.test.ts
```

### Memory Issues
```bash
# Run tests individually
npm test -- tests/comprehensive/data-quality.test.ts
npm test -- tests/comprehensive/edge-cases.test.ts
# ... etc
```

## Contributing New Tests

1. **Add test file** to `tests/comprehensive/`
2. **Follow naming convention:** `category-name.test.ts`
3. **Use test fixtures:** `createTestDatabase()`, `closeTestDatabase()`
4. **Document purpose:** Add clear describe blocks
5. **Update this README:** Add new test file to table

### Test Template
```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import type { Database } from 'better-sqlite3';

describe('New Test Category', () => {
  let db: Database;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(() => {
    closeTestDatabase(db);
  });

  it('descriptive test name', async () => {
    // Test implementation
  });
});
```

## Known Issues & Limitations

### Current Limitations
1. **Test database:** Uses same database as production (consider separate test fixtures)
2. **Performance tests:** May be affected by system load
3. **Concurrent tests:** Limited by SQLite's locking behavior

### Future Improvements
- [ ] Add separate test database with known data
- [ ] Add mutation testing for robust error handling
- [ ] Add integration tests with real MCP protocol
- [ ] Add load testing with realistic query patterns
- [ ] Add chaos testing for database corruption scenarios

## References

- **Main Test Documentation:** `/docs/TESTING-v0.4.0.md`
- **Vitest Docs:** https://vitest.dev/
- **SQLite FTS5:** https://www.sqlite.org/fts5.html
- **Better-SQLite3:** https://github.com/WiseLibs/better-sqlite3

---

**Last Updated:** 2026-01-27
**Maintainer:** EU Compliance MCP Team
**Issues:** https://github.com/Ansvar-Systems/EU_compliance_MCP/issues
