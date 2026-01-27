import Database from 'better-sqlite3';
import { getArticle } from '../dist/tools/article.js';

const db = new Database('data/regulations.db', { readonly: true });

// Test DORA Article 17 cross-references
const dora17 = await getArticle(db, { regulation: 'DORA', article: '17' });
console.log('DORA Article 17:');
console.log('  Title:', dora17.title);
console.log('  Cross-refs:', dora17.cross_references);
console.log();

// Test NIS2 Article 23 cross-references
const nis23 = await getArticle(db, { regulation: 'NIS2', article: '23' });
console.log('NIS2 Article 23:');
console.log('  Title:', nis23.title);
console.log('  Cross-refs:', nis23.cross_references);
console.log();

// Test GDPR Article 33 cross-references
const gdpr33 = await getArticle(db, { regulation: 'GDPR', article: '33' });
console.log('GDPR Article 33:');
console.log('  Title:', gdpr33.title);
console.log('  Cross-refs:', gdpr33.cross_references);

db.close();
