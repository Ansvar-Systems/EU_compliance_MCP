#!/usr/bin/env npx tsx

/**
 * Test PostgreSQL adapter with migrated data
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npx tsx scripts/test-postgres-adapter.ts
 */

import { PostgreSQLAdapter } from '../packages/core/src/adapters/postgresql-adapter.js';

async function main() {
  console.log('🧪 Testing PostgreSQL Adapter\n');

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log(`🐘 Connecting to: ${connectionString.replace(/:[^:@]+@/, ':***@')}\n`);

  const adapter = new PostgreSQLAdapter(connectionString);

  try {
    // Test 1: Connection
    console.log('Test 1: Connection');
    const connected = await adapter.testConnection();
    console.log(connected ? '✅ Connected\n' : '❌ Connection failed\n');
    if (!connected) process.exit(1);

    // Test 2: Get all regulations
    console.log('Test 2: Get all regulations');
    const regulations = await adapter.getAllRegulations();
    console.log(`✅ Found ${regulations.length} regulations`);
    console.log(`   First 3: ${regulations.slice(0, 3).map(r => r.id).join(', ')}\n`);

    // Test 3: Get specific regulation
    console.log('Test 3: Get specific regulation (GDPR)');
    const gdpr = await adapter.getRegulationById('GDPR');
    if (gdpr) {
      console.log(`✅ ${gdpr.full_name}`);
      console.log(`   CELEX: ${gdpr.celex_id}\n`);
    } else {
      console.log('❌ GDPR not found\n');
      process.exit(1);
    }

    // Test 4: Search articles
    console.log('Test 4: Search articles for "incident reporting"');
    const searchResults = await adapter.searchArticles('incident reporting', undefined, 5);
    console.log(`✅ Found ${searchResults.length} results`);
    searchResults.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.item.regulation} Article ${result.item.article_number}: ${result.item.title}`);
      console.log(`      Rank: ${result.rank.toFixed(4)}`);
    });
    console.log();

    // Test 5: Get specific article
    console.log('Test 5: Get GDPR Article 17');
    const article = await adapter.getArticle('GDPR', '17');
    if (article) {
      console.log(`✅ ${article.title}`);
      console.log(`   Text length: ${article.text.length} characters`);
      if (article.recitals) {
        console.log(`   Related recitals: ${article.recitals}\n`);
      }
    } else {
      console.log('❌ Article not found\n');
      process.exit(1);
    }

    // Test 6: Get recital
    console.log('Test 6: Get GDPR Recital 1');
    const recital = await adapter.getRecital('GDPR', 1);
    if (recital) {
      console.log(`✅ Text: ${recital.text.substring(0, 100)}...`);
      console.log(`   Full length: ${recital.text.length} characters\n`);
    } else {
      console.log('❌ Recital not found\n');
      process.exit(1);
    }

    // Test 7: Search recitals
    console.log('Test 7: Search recitals for "data protection"');
    const recitalResults = await adapter.searchRecitals('data protection', 3);
    console.log(`✅ Found ${recitalResults.length} recital results`);
    recitalResults.forEach((result, i) => {
      console.log(`   ${i + 1}. ${result.item.regulation} Recital ${result.item.recital_number}`);
      console.log(`      Rank: ${result.rank.toFixed(4)}`);
    });
    console.log();

    // Test 8: Get definitions
    console.log('Test 8: Search definitions for "personal data"');
    const definitions = await adapter.getDefinitions('personal data');
    console.log(`✅ Found ${definitions.length} definitions`);
    definitions.slice(0, 3).forEach((def, i) => {
      console.log(`   ${i + 1}. ${def.regulation}: ${def.term}`);
      console.log(`      ${def.definition.substring(0, 80)}...`);
    });
    console.log();

    // Test 9: Get control mappings
    console.log('Test 9: Get ISO 27001 control mappings');
    const mappings = await adapter.getControlMappings('ISO27001', undefined, undefined);
    console.log(`✅ Found ${mappings.length} ISO 27001 mappings`);
    const sample = mappings.slice(0, 2);
    sample.forEach((map, i) => {
      console.log(`   ${i + 1}. ${map.control_id}: ${map.control_name}`);
      console.log(`      → ${map.regulation} (${map.coverage})`);
    });
    console.log();

    // Test 10: Get applicability rules
    console.log('Test 10: Get applicability rules for financial sector');
    const rules = await adapter.getApplicabilityRules('financial');
    console.log(`✅ Found ${rules.length} applicability rules`);
    rules.slice(0, 3).forEach((rule, i) => {
      console.log(`   ${i + 1}. ${rule.regulation}: ${rule.applies ? 'Applies' : 'Does not apply'}`);
      console.log(`      Confidence: ${rule.confidence}`);
    });
    console.log();

    // Test 11: Statistics
    console.log('Test 11: Get database statistics');
    const stats = await adapter.getStatistics();
    console.log('✅ Statistics:');
    console.log(`   Regulations:        ${stats.regulations}`);
    console.log(`   Articles:           ${stats.articles}`);
    console.log(`   Recitals:           ${stats.recitals}`);
    console.log(`   Definitions:        ${stats.definitions}`);
    console.log(`   Control Mappings:   ${stats.control_mappings}\n`);

    console.log('='.repeat(60));
    console.log('✅ All tests passed!');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    await adapter.close();
  }
}

main();
