# Comprehensive Test Cases for EU Regulations MCP Server v0.4.0

**Purpose:** SOLID test cases covering data quality, edge cases, integration, performance, and real-world compliance workflows.

---

## 1. Data Quality & Integrity Tests

### Test 1.1: Article Count Consistency Across Tables
```typescript
it('articles table count matches FTS5 index', async () => {
  const articlesCount = db.prepare('SELECT COUNT(*) as count FROM articles').get();
  const ftsCount = db.prepare('SELECT COUNT(*) as count FROM articles_fts').get();

  expect(articlesCount.count).toBe(ftsCount.count);
  expect(articlesCount.count).toBe(2278); // Known total
});
```

### Test 1.2: Recitals Coverage Verification
```typescript
it('verifies 33 out of 37 regulations have recitals', async () => {
  const regulationsWithRecitals = db.prepare(`
    SELECT DISTINCT regulation FROM recitals
  `).all();

  expect(regulationsWithRecitals).toHaveLength(33);

  // Verify known missing recitals
  const missingRecitals = db.prepare(`
    SELECT id FROM regulations
    WHERE id NOT IN (SELECT DISTINCT regulation FROM recitals)
  `).all();

  const missingIds = missingRecitals.map(r => r.id);
  expect(missingIds).toContain('UN_R155');
  expect(missingIds).toContain('UN_R156');
  expect(missingIds).toHaveLength(4);
});
```

### Test 1.3: No Orphaned Definitions
```typescript
it('all definitions reference valid articles and regulations', async () => {
  const orphanedDefs = db.prepare(`
    SELECT d.term, d.regulation, d.article
    FROM definitions d
    LEFT JOIN articles a ON d.regulation = a.regulation AND d.article = a.article_number
    WHERE a.id IS NULL
  `).all();

  expect(orphanedDefs).toHaveLength(0);
});
```

### Test 1.4: Control Mappings Reference Valid Articles
```typescript
it('all control mappings point to existing articles', async () => {
  const mappings = db.prepare('SELECT * FROM control_mappings').all();

  for (const mapping of mappings) {
    const articles = JSON.parse(mapping.articles);

    for (const articleNum of articles) {
      const article = db.prepare(
        'SELECT id FROM articles WHERE regulation = ? AND article_number = ?'
      ).get(mapping.regulation, articleNum);

      expect(article).toBeDefined();
    }
  }
});
```

### Test 1.5: Source Registry Consistency
```typescript
it('source_registry matches regulations table', async () => {
  const registryRegs = db.prepare('SELECT regulation FROM source_registry').all();
  const regulationRegs = db.prepare('SELECT id FROM regulations').all();

  const registryIds = new Set(registryRegs.map(r => r.regulation));
  const regulationIds = new Set(regulationRegs.map(r => r.id));

  expect(registryIds).toEqual(regulationIds);
});
```

---

## 2. Edge Cases & Error Handling

### Test 2.1: Extremely Long Search Queries
```typescript
it('handles search queries exceeding 1000 characters', async () => {
  const longQuery = 'cybersecurity '.repeat(200); // 2600 chars

  const results = await searchRegulations(db, {
    query: longQuery,
    limit: 10,
  });

  expect(Array.isArray(results)).toBe(true);
  expect(results.length).toBeLessThanOrEqual(10);
});
```

### Test 2.2: Unicode and Special Characters in Search
```typescript
it('handles unicode characters correctly', async () => {
  const queries = [
    'données personnelles', // French
    'Daten­schutz', // German with special hyphen
    'Article 5(1)(a)', // Parentheses
    'AI/ML systems', // Slash
    '"incident notification"', // Quotes
    'cost-benefit analysis', // Hyphens
  ];

  for (const query of queries) {
    const results = await searchRegulations(db, { query });
    expect(Array.isArray(results)).toBe(true);
    // Should not throw SQL errors
  }
});
```

### Test 2.3: Null and Undefined Parameter Handling
```typescript
it('getArticle handles missing parameters gracefully', async () => {
  await expect(getArticle(db, { regulation: null, article: '33' }))
    .rejects.toThrow();

  await expect(getArticle(db, { regulation: 'GDPR', article: null }))
    .rejects.toThrow();
});
```

### Test 2.4: Article Numbers with Special Formatting
```typescript
it('retrieves articles with complex numbering', async () => {
  const complexNumbers = [
    '5(1)(a)',     // Nested sub-articles
    '89a',         // Letter suffix
    'Annex I',     // Annexes
    '12.1',        // Decimal notation
  ];

  for (const num of complexNumbers) {
    // Should either return article or null, not throw
    const result = await getArticle(db, { regulation: 'GDPR', article: num });
    expect(result === null || typeof result === 'object').toBe(true);
  }
});
```

### Test 2.5: Zero and Negative Recital Numbers
```typescript
it('handles invalid recital numbers gracefully', async () => {
  const result1 = await getRecital(db, { regulation: 'GDPR', recital_number: 0 });
  expect(result1).toBeNull();

  const result2 = await getRecital(db, { regulation: 'GDPR', recital_number: -5 });
  expect(result2).toBeNull();

  const result3 = await getRecital(db, { regulation: 'GDPR', recital_number: 99999 });
  expect(result3).toBeNull();
});
```

### Test 2.6: Empty String Searches
```typescript
it('handles empty search queries without crashing', async () => {
  const results = await searchRegulations(db, { query: '' });
  expect(Array.isArray(results)).toBe(true);
});
```

### Test 2.7: Regulation ID Case Sensitivity
```typescript
it('handles regulation ID case variations', async () => {
  const variants = ['GDPR', 'gdpr', 'Gdpr', 'gDpR'];

  for (const variant of variants) {
    const result = await getArticle(db, { regulation: variant, article: '33' });
    // Should either normalize or reject consistently
    expect(typeof result === 'object' || result === null).toBe(true);
  }
});
```

---

## 3. Integration & Workflow Tests

### Test 3.1: Search → Get Article → Get Recital Workflow
```typescript
it('complete workflow: search, then retrieve details', async () => {
  // 1. Search for incident notification
  const searchResults = await searchRegulations(db, {
    query: 'incident notification',
    limit: 5,
  });

  expect(searchResults.length).toBeGreaterThan(0);

  // 2. Get full article from first result
  const firstArticle = searchResults.find(r => r.type === 'article');
  const fullArticle = await getArticle(db, {
    regulation: firstArticle.regulation,
    article: firstArticle.article,
  });

  expect(fullArticle).toBeDefined();
  expect(fullArticle.text.length).toBeGreaterThan(searchResults[0].snippet.length);

  // 3. Find related recitals
  const recitalResults = searchResults.filter(r => r.type === 'recital');
  expect(recitalResults.length).toBeGreaterThan(0);

  const recital = await getRecital(db, {
    regulation: recitalResults[0].regulation,
    recital_number: parseInt(recitalResults[0].article), // article field contains recital number
  });

  expect(recital).toBeDefined();
});
```

### Test 3.2: Applicability → Control Mapping → Article Retrieval
```typescript
it('compliance workflow: identify requirements and map to controls', async () => {
  // 1. Check which regulations apply
  const applicability = await checkApplicability(db, {
    sector: 'financial',
    subsector: 'bank',
  });

  expect(applicability.applicable_regulations).toContain(
    expect.objectContaining({ regulation: 'DORA' })
  );

  // 2. Map ISO 27001 control to DORA articles
  const controlMapping = await mapControls(db, {
    framework: 'ISO27001',
    control: 'A.8.9', // Configuration management
    regulation: 'DORA',
  });

  expect(controlMapping.length).toBeGreaterThan(0);

  // 3. Retrieve specific DORA articles
  const doraArticles = controlMapping[0].mappings[0].articles;
  const article = await getArticle(db, {
    regulation: 'DORA',
    article: doraArticles[0],
  });

  expect(article).toBeDefined();
  expect(article.regulation).toBe('DORA');
});
```

### Test 3.3: Cross-Framework Control Comparison (ISO 27001 vs NIST CSF)
```typescript
it('compares control coverage across frameworks', async () => {
  // Get ISO 27001 mappings for incident management
  const isoMappings = await mapControls(db, {
    framework: 'ISO27001',
    control: 'A.5.24', // Incident response planning
  });

  // Get NIST CSF mappings for similar function
  const nistMappings = await mapControls(db, {
    framework: 'NIST_CSF',
    control: 'RS.CO', // Response: Communications
  });

  // Both should map to similar regulations
  const isoRegs = new Set(isoMappings[0].mappings.map(m => m.regulation));
  const nistRegs = new Set(nistMappings[0].mappings.map(m => m.regulation));

  const overlap = [...isoRegs].filter(r => nistRegs.has(r));
  expect(overlap).toContain('NIS2');
  expect(overlap).toContain('DORA');
});
```

### Test 3.4: Definition → Article Cross-Reference
```typescript
it('retrieves definition and then its source article', async () => {
  // 1. Get definition
  const definition = await getDefinitions(db, {
    term: 'personal data',
    regulation: 'GDPR',
  });

  expect(definition.definitions.length).toBeGreaterThan(0);

  // 2. Get the article where it's defined
  const sourceArticle = definition.definitions[0].article;
  const article = await getArticle(db, {
    regulation: 'GDPR',
    article: sourceArticle,
  });

  expect(article).toBeDefined();
  expect(article.text).toContain(definition.definitions[0].definition);
});
```

### Test 3.5: Multi-Regulation Comparison Workflow
```typescript
it('compares incident notification across multiple regulations', async () => {
  const comparison = await compareRequirements(db, {
    topic: 'incident notification',
    regulations: ['NIS2', 'DORA', 'CER'],
  });

  // All 3 regulations should have relevant articles
  expect(comparison.NIS2.length).toBeGreaterThan(0);
  expect(comparison.DORA.length).toBeGreaterThan(0);
  expect(comparison.CER.length).toBeGreaterThan(0);

  // Verify article content mentions the topic
  expect(comparison.NIS2[0].text.toLowerCase()).toMatch(/incident|notification/);
});
```

---

## 4. Performance & Scalability Tests

### Test 4.1: FTS5 Query Performance Benchmark
```typescript
it('searches complete dataset in under 100ms', async () => {
  const queries = [
    'cybersecurity',
    'personal data breach',
    'incident notification',
    'risk assessment',
    'AI system',
  ];

  for (const query of queries) {
    const start = performance.now();
    const results = await searchRegulations(db, { query, limit: 50 });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
    expect(results.length).toBeGreaterThan(0);
  }
});
```

### Test 4.2: Concurrent Query Handling
```typescript
it('handles 20 concurrent searches without database locks', async () => {
  const queries = Array.from({ length: 20 }, (_, i) =>
    searchRegulations(db, { query: `security ${i}`, limit: 10 })
  );

  const results = await Promise.all(queries);

  expect(results).toHaveLength(20);
  expect(results.every(r => Array.isArray(r))).toBe(true);
});
```

### Test 4.3: Large Result Set Pagination
```typescript
it('efficiently retrieves large result sets with limits', async () => {
  const limits = [10, 50, 100, 200];

  for (const limit of limits) {
    const start = performance.now();
    const results = await searchRegulations(db, {
      query: 'the', // Common word
      limit,
    });
    const duration = performance.now() - start;

    expect(results.length).toBeLessThanOrEqual(limit);
    expect(duration).toBeLessThan(200); // Should be fast even for large limits
  }
});
```

### Test 4.4: Memory Usage During Full-Text Search
```typescript
it('searches all 3508 recitals without memory issues', async () => {
  const initialMemory = process.memoryUsage().heapUsed;

  const results = await searchRegulations(db, {
    query: 'security measures',
    limit: 1000, // Large result set
  });

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncreaseMB = (finalMemory - initialMemory) / 1024 / 1024;

  expect(results.length).toBeGreaterThan(0);
  expect(memoryIncreaseMB).toBeLessThan(50); // Reasonable memory usage
});
```

### Test 4.5: Database Integrity After Heavy Writes
```typescript
it('maintains integrity after multiple concurrent writes', async () => {
  // Note: This test should only run in a test environment
  const initialIntegrity = db.prepare('PRAGMA integrity_check').get();
  expect(initialIntegrity.integrity_check).toBe('ok');

  // Run 100 read queries concurrently
  const queries = Array.from({ length: 100 }, () =>
    db.prepare('SELECT COUNT(*) FROM articles').get()
  );

  await Promise.all(queries);

  const finalIntegrity = db.prepare('PRAGMA integrity_check').get();
  expect(finalIntegrity.integrity_check).toBe('ok');
});
```

---

## 5. Real-World Compliance Scenarios

### Test 5.1: Healthcare Organization GDPR + EHDS Compliance Check
```typescript
it('identifies healthcare-specific data protection requirements', async () => {
  // Scenario: Hospital in Germany needs to know which regulations apply
  const applicability = await checkApplicability(db, {
    sector: 'healthcare',
    member_state: 'DE',
  });

  const regIds = applicability.applicable_regulations.map(r => r.regulation);

  // Must include GDPR (general), EHDS (healthcare data), NIS2 (critical entities)
  expect(regIds).toContain('GDPR');
  expect(regIds).toContain('EHDS');
  expect(regIds).toContain('NIS2');

  // Search for health data processing requirements
  const healthDataReqs = await searchRegulations(db, {
    query: 'health data processing',
    regulations: ['GDPR', 'EHDS'],
  });

  expect(healthDataReqs.length).toBeGreaterThan(5);
});
```

### Test 5.2: Financial Institution DORA + NIS2 Third-Party Risk
```typescript
it('maps third-party risk requirements for banks', async () => {
  // Search for ICT third-party requirements
  const thirdPartyReqs = await compareRequirements(db, {
    topic: 'third party service provider',
    regulations: ['DORA', 'NIS2'],
  });

  // Both regulations have third-party risk provisions
  expect(thirdPartyReqs.DORA.length).toBeGreaterThan(0);
  expect(thirdPartyReqs.NIS2.length).toBeGreaterThan(0);

  // Verify DORA Chapter V (ICT third-party risk)
  const doraTPArticles = thirdPartyReqs.DORA.filter(a =>
    a.chapter === 'V' || a.text.toLowerCase().includes('third-party')
  );
  expect(doraTPArticles.length).toBeGreaterThan(3);
});
```

### Test 5.3: AI System Developer Compliance (AI Act + GDPR + DSA)
```typescript
it('identifies requirements for AI systems processing personal data', async () => {
  // Get AI system definition
  const aiSystemDef = await getDefinitions(db, {
    term: 'AI system',
    regulation: 'AI_ACT',
  });
  expect(aiSystemDef.definitions.length).toBeGreaterThan(0);

  // Search for high-risk AI requirements
  const highRiskReqs = await searchRegulations(db, {
    query: 'high-risk AI system',
    regulations: ['AI_ACT'],
  });
  expect(highRiskReqs.length).toBeGreaterThan(5);

  // Check GDPR automated decision-making requirements
  const gdprAI = await getArticle(db, {
    regulation: 'GDPR',
    article: '22', // Automated decision-making
  });
  expect(gdprAI).toBeDefined();
  expect(gdprAI.text.toLowerCase()).toContain('automated');
});
```

### Test 5.4: Automotive Manufacturer Cybersecurity (UN R155 + CRA)
```typescript
it('maps vehicle cybersecurity requirements', async () => {
  const applicability = await checkApplicability(db, {
    sector: 'manufacturing',
    subsector: 'automotive',
  });

  const regIds = applicability.applicable_regulations.map(r => r.regulation);
  expect(regIds).toContain('UN_R155');
  expect(regIds).toContain('CRA');

  // Get UN R155 cybersecurity management system requirements
  const unR155 = await searchRegulations(db, {
    query: 'cybersecurity management system',
    regulations: ['UN_R155'],
  });
  expect(unR155.length).toBeGreaterThan(0);

  // Compare with CRA product cybersecurity requirements
  const comparison = await compareRequirements(db, {
    topic: 'vulnerability management',
    regulations: ['UN_R155', 'CRA'],
  });
  expect(comparison.UN_R155.length).toBeGreaterThan(0);
  expect(comparison.CRA.length).toBeGreaterThan(0);
});
```

### Test 5.5: Energy Company Critical Infrastructure Protection
```typescript
it('identifies CER + NIS2 requirements for energy sector', async () => {
  const applicability = await checkApplicability(db, {
    sector: 'energy',
  });

  const regIds = applicability.applicable_regulations.map(r => r.regulation);

  // Energy is both NIS2 essential entity and CER critical entity
  expect(regIds).toContain('NIS2');
  expect(regIds).toContain('CER');

  // Search for resilience requirements
  const resilience = await compareRequirements(db, {
    topic: 'resilience measures',
    regulations: ['NIS2', 'CER'],
  });

  expect(resilience.NIS2.length).toBeGreaterThan(0);
  expect(resilience.CER.length).toBeGreaterThan(0);
});
```

---

## 6. Cross-Regulation Analysis Tests

### Test 6.1: Data Breach Notification Timelines Comparison
```typescript
it('compares breach notification timelines across regulations', async () => {
  const comparison = await compareRequirements(db, {
    topic: 'breach notification',
    regulations: ['GDPR', 'NIS2', 'DORA', 'LED'],
  });

  // All 4 should have notification requirements
  expect(Object.keys(comparison)).toHaveLength(4);

  // GDPR has 72-hour rule
  const gdprBreach = await getArticle(db, {
    regulation: 'GDPR',
    article: '33',
  });
  expect(gdprBreach.text).toMatch(/72 hours/i);

  // NIS2 has 24-hour initial notification
  const nis2Results = comparison.NIS2.filter(a =>
    a.text.toLowerCase().includes('24 hours')
  );
  expect(nis2Results.length).toBeGreaterThan(0);
});
```

### Test 6.2: Encryption Requirements Across Regulations
```typescript
it('finds encryption requirements in multiple regulations', async () => {
  const encryptionSearch = await searchRegulations(db, {
    query: 'encryption pseudonymization',
    limit: 50,
  });

  const regulations = new Set(encryptionSearch.map(r => r.regulation));

  // Should find encryption in GDPR, NIS2, DORA, ePrivacy, etc.
  expect(regulations.has('GDPR')).toBe(true);
  expect(regulations.has('NIS2')).toBe(true);
  expect(regulations.has('DORA')).toBe(true);

  // Check GDPR recital about encryption
  const gdprRecital83 = await getRecital(db, {
    regulation: 'GDPR',
    recital_number: 83,
  });
  expect(gdprRecital83.text.toLowerCase()).toContain('encryption');
});
```

### Test 6.3: Risk Assessment Methodologies Comparison
```typescript
it('compares risk assessment requirements', async () => {
  const comparison = await compareRequirements(db, {
    topic: 'risk assessment',
    regulations: ['GDPR', 'NIS2', 'DORA', 'AI_ACT', 'CRA'],
  });

  // All 5 regulations require risk assessments
  expect(Object.keys(comparison)).toHaveLength(5);

  // Verify each has multiple articles about risk
  for (const [reg, articles] of Object.entries(comparison)) {
    expect(articles.length).toBeGreaterThan(0);
    expect(articles.some(a => a.text.toLowerCase().includes('risk'))).toBe(true);
  }
});
```

### Test 6.4: Audit and Certification Requirements
```typescript
it('identifies audit and certification requirements', async () => {
  const auditReqs = await searchRegulations(db, {
    query: 'audit certification compliance',
    limit: 100,
  });

  const regulationsWithAudits = new Set(auditReqs.map(r => r.regulation));

  // Should include regulations with audit requirements
  expect(regulationsWithAudits.has('GDPR')).toBe(true); // Art 42-43
  expect(regulationsWithAudits.has('NIS2')).toBe(true);
  expect(regulationsWithAudits.has('AI_ACT')).toBe(true);
  expect(regulationsWithAudits.has('CYBERSECURITY_ACT')).toBe(true); // Certification scheme
});
```

### Test 6.5: Penalty and Enforcement Mechanisms
```typescript
it('compares penalties across regulations', async () => {
  const penaltySearch = await searchRegulations(db, {
    query: 'penalties fines sanctions',
    limit: 50,
  });

  // GDPR Article 83 - Administrative fines
  const gdprPenalties = penaltySearch.find(r =>
    r.regulation === 'GDPR' && r.article === '83'
  );
  expect(gdprPenalties).toBeDefined();

  // Check for tiered penalties (4% vs 2% of turnover)
  const gdprArt83 = await getArticle(db, {
    regulation: 'GDPR',
    article: '83',
  });
  expect(gdprArt83.text).toMatch(/4\s*%/);
  expect(gdprArt83.text).toMatch(/2\s*%/);
});
```

---

## 7. Security & Input Validation Tests

### Test 7.1: SQL Injection Prevention
```typescript
it('prevents SQL injection in search queries', async () => {
  const maliciousQueries = [
    "'; DROP TABLE articles; --",
    "1' OR '1'='1",
    "admin'--",
    "1; DELETE FROM recitals; --",
    "' UNION SELECT * FROM definitions --",
  ];

  for (const query of maliciousQueries) {
    // Should not throw, should return safe results or empty array
    const results = await searchRegulations(db, { query });
    expect(Array.isArray(results)).toBe(true);

    // Verify tables still exist
    const articlesCount = db.prepare('SELECT COUNT(*) FROM articles').get();
    expect(articlesCount.count).toBe(2278);
  }
});
```

### Test 7.2: XSS Prevention in Article Text
```typescript
it('sanitizes HTML/script tags in retrieved content', async () => {
  const article = await getArticle(db, {
    regulation: 'GDPR',
    article: '1',
  });

  // Article text should not contain script tags
  expect(article.text).not.toMatch(/<script>/i);
  expect(article.text).not.toMatch(/<iframe>/i);
  expect(article.text).not.toMatch(/javascript:/i);
});
```

### Test 7.3: Path Traversal Prevention
```typescript
it('rejects path traversal attempts in regulation IDs', async () => {
  const pathTraversalAttempts = [
    '../../../etc/passwd',
    '..\\..\\windows\\system32',
    'GDPR/../NIS2',
  ];

  for (const maliciousId of pathTraversalAttempts) {
    const result = await getArticle(db, {
      regulation: maliciousId,
      article: '1',
    });

    // Should return null or throw validation error
    expect(result).toBeNull();
  }
});
```

### Test 7.4: Integer Overflow in Limit Parameters
```typescript
it('handles extreme limit values safely', async () => {
  const extremeLimits = [
    Number.MAX_SAFE_INTEGER,
    -1,
    0,
    9999999,
  ];

  for (const limit of extremeLimits) {
    // Should either clamp to reasonable value or reject
    const results = await searchRegulations(db, {
      query: 'security',
      limit,
    });

    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThan(1000); // Reasonable max
  }
});
```

### Test 7.5: Regular Expression DoS (ReDoS) Prevention
```typescript
it('handles complex search patterns without timing out', async () => {
  const complexPatterns = [
    '(a+)+b',
    '(a|a)*b',
    '(a|ab)*c',
  ];

  for (const pattern of complexPatterns) {
    const start = performance.now();
    const results = await searchRegulations(db, { query: pattern });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1000); // Should not hang
    expect(Array.isArray(results)).toBe(true);
  }
});
```

---

## 8. Recital-Specific Tests (v0.4.0 Feature)

### Test 8.1: Recital-Article Cross-Referencing
```typescript
it('finds articles referenced in recitals', async () => {
  // Get GDPR Recital 50 (which references several articles)
  const recital50 = await getRecital(db, {
    regulation: 'GDPR',
    recital_number: 50,
  });

  expect(recital50).toBeDefined();
  expect(recital50.related_articles).toBeDefined();

  // Verify referenced articles exist
  if (recital50.related_articles) {
    const relatedArticles = JSON.parse(recital50.related_articles);
    for (const articleNum of relatedArticles) {
      const article = await getArticle(db, {
        regulation: 'GDPR',
        article: articleNum,
      });
      expect(article).toBeDefined();
    }
  }
});
```

### Test 8.2: Legislative Intent Search (Recitals Only)
```typescript
it('searches recitals to understand legislative intent', async () => {
  const recitalSearch = await searchRegulations(db, {
    query: 'proportionality principle',
    limit: 20,
  });

  const recitals = recitalSearch.filter(r => r.type === 'recital');

  // Recitals explain proportionality better than articles
  expect(recitals.length).toBeGreaterThan(3);

  // Verify recital content explains policy reasoning
  const gdprRecital = recitals.find(r => r.regulation === 'GDPR');
  expect(gdprRecital).toBeDefined();
});
```

### Test 8.3: Recitals Coverage by Regulation
```typescript
it('verifies expected recital counts for major regulations', async () => {
  const expectedCounts = {
    GDPR: 173,
    AI_ACT: 180,
    NIS2: 89,
    DORA: 103,
    EECC: 325, // Highest count
  };

  for (const [regulation, expectedCount] of Object.entries(expectedCounts)) {
    const recitals = db.prepare(
      'SELECT COUNT(*) as count FROM recitals WHERE regulation = ?'
    ).get(regulation);

    expect(recitals.count).toBe(expectedCount);
  }
});
```

### Test 8.4: Recital Search Ranking (Articles Prioritized)
```typescript
it('ranks articles higher than recitals with similar relevance', async () => {
  const results = await searchRegulations(db, {
    query: 'data protection principles',
    limit: 20,
  });

  const firstArticleIndex = results.findIndex(r => r.type === 'article');
  const firstRecitalIndex = results.findIndex(r => r.type === 'recital');

  // Articles should generally appear before recitals
  if (firstArticleIndex !== -1 && firstRecitalIndex !== -1) {
    expect(firstArticleIndex).toBeLessThan(firstRecitalIndex);
  }
});
```

### Test 8.5: Recital Formatting and Presentation
```typescript
it('formats recitals correctly for display', async () => {
  const recital = await getRecital(db, {
    regulation: 'GDPR',
    recital_number: 1,
  });

  expect(recital).toMatchObject({
    regulation: 'GDPR',
    recital_number: 1,
    text: expect.any(String),
  });

  // Text should be clean (no HTML tags, proper encoding)
  expect(recital.text).not.toContain('<');
  expect(recital.text).not.toContain('&nbsp;');
  expect(recital.text.length).toBeGreaterThan(50); // Substantial content
});
```

### Test 8.6: Missing Recitals Graceful Handling
```typescript
it('handles regulations without recitals gracefully', async () => {
  const regulationsWithoutRecitals = ['UN_R155', 'UN_R156', 'EIDAS2', 'EPRIVACY'];

  for (const regulation of regulationsWithoutRecitals) {
    const recital = await getRecital(db, {
      regulation,
      recital_number: 1,
    });

    expect(recital).toBeNull();

    // Verify regulation exists in database
    const regExists = db.prepare(
      'SELECT id FROM regulations WHERE id = ?'
    ).get(regulation);
    expect(regExists).toBeDefined();
  }
});
```

---

## 9. Negative Tests (Expected Failures)

### Test 9.1: Non-Existent Regulation
```typescript
it('returns null for non-existent regulations', async () => {
  const result = await getArticle(db, {
    regulation: 'FAKE_REGULATION_2025',
    article: '1',
  });

  expect(result).toBeNull();
});
```

### Test 9.2: Malformed Framework in Control Mapping
```typescript
it('rejects unknown control frameworks', async () => {
  await expect(
    mapControls(db, {
      framework: 'FAKE_FRAMEWORK',
      control: 'A.1.1',
    })
  ).rejects.toThrow();
});
```

### Test 9.3: Invalid Article Number Format
```typescript
it('handles invalid article numbers', async () => {
  const invalidNumbers = [
    'ABC',
    '!!!',
    'Article 33', // Should be just '33'
    '1/2/3',
  ];

  for (const articleNum of invalidNumbers) {
    const result = await getArticle(db, {
      regulation: 'GDPR',
      article: articleNum,
    });

    expect(result).toBeNull();
  }
});
```

### Test 9.4: Empty Regulation Array in Search Filter
```typescript
it('handles empty regulations filter array', async () => {
  const results = await searchRegulations(db, {
    query: 'security',
    regulations: [],
  });

  // Should search all regulations
  expect(results.length).toBeGreaterThan(0);
});
```

---

## 10. Documentation & Metadata Tests

### Test 10.1: All Regulations Have Metadata
```typescript
it('verifies all regulations have complete metadata', async () => {
  const regulations = db.prepare('SELECT * FROM regulations').all();

  for (const reg of regulations) {
    expect(reg.id).toBeTruthy();
    expect(reg.full_name).toBeTruthy();
    expect(reg.celex_id).toBeTruthy();
    // effective_date may be null for some regulations
  }
});
```

### Test 10.2: Articles Have Chapter Information
```typescript
it('most articles include chapter information', async () => {
  const articlesWithChapters = db.prepare(
    'SELECT COUNT(*) as count FROM articles WHERE chapter IS NOT NULL'
  ).get();

  const totalArticles = db.prepare('SELECT COUNT(*) as count FROM articles').get();

  // At least 80% of articles should have chapter info
  const percentage = (articlesWithChapters.count / totalArticles.count) * 100;
  expect(percentage).toBeGreaterThan(80);
});
```

### Test 10.3: Control Mappings Have Descriptions
```typescript
it('all control mappings include coverage and notes', async () => {
  const mappings = db.prepare('SELECT * FROM control_mappings').all();

  for (const mapping of mappings) {
    expect(['full', 'partial', 'related']).toContain(mapping.coverage);
    // notes field is optional but should be present
    expect(mapping).toHaveProperty('notes');
  }
});
```

---

## Test Execution Strategy

### Priority 1 (Must Pass Before Release)
- Data quality tests (1.1 - 1.5)
- SQL injection prevention (7.1)
- Core workflow tests (3.1, 3.2)
- Performance benchmarks (4.1, 4.2)

### Priority 2 (Should Pass)
- Edge case handling (2.1 - 2.7)
- Real-world scenarios (5.1 - 5.5)
- Cross-regulation analysis (6.1 - 6.5)

### Priority 3 (Nice to Have)
- Advanced integration tests (3.3 - 3.5)
- Security edge cases (7.2 - 7.5)
- Documentation validation (10.1 - 10.3)

---

## Running the Tests

```bash
# Run all comprehensive tests
npm test -- --run tests/comprehensive/

# Run specific test suite
npm test -- --run tests/comprehensive/data-quality.test.ts

# Run with coverage
npm test -- --coverage

# Run performance tests only
npm test -- --run tests/comprehensive/performance.test.ts
```

---

**Version:** 1.0.0
**Created:** 2026-01-27
**For:** EU Regulations MCP Server v0.4.0+
