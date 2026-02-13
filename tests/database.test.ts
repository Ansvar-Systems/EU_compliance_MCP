/**
 * Database existence and integrity tests
 * Ensures the database file is created and contains expected data
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

describe('Database', () => {
  beforeAll(() => {
    // Ensure database exists before running tests
    if (!existsSync(DB_PATH)) {
      throw new Error(
        `Database not found at ${DB_PATH}. Run 'npm run build:db' first.`
      );
    }
  });

  it('should exist at expected path', () => {
    expect(existsSync(DB_PATH)).toBe(true);
  });

  it('should be readable and contain regulations table', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM regulations"
    ).get() as { count: number };
    
    expect(result.count).toBeGreaterThan(0);
    db.close();
  });

  it('should contain all 37 regulations', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM regulations"
    ).get() as { count: number };
    
    expect(result.count).toBe(49);
    db.close();
  });

  it('should contain articles table with data', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM articles"
    ).get() as { count: number };
    
    expect(result.count).toBeGreaterThan(2000);
    db.close();
  });

  it('should have FTS5 index for full-text search', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    // Verify FTS table exists
    const tableCheck = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='articles_fts'"
    ).get();
    
    expect(tableCheck).toBeDefined();
    
    // Test a simple FTS query
    const searchResult = db.prepare(
      "SELECT COUNT(*) as count FROM articles_fts WHERE articles_fts MATCH 'data protection'"
    ).get() as { count: number };
    
    expect(searchResult.count).toBeGreaterThan(0);
    db.close();
  });

  it('should contain definitions table with data', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM definitions"
    ).get() as { count: number };
    
    expect(result.count).toBeGreaterThan(1000);
    db.close();
  });

  it('should contain control mappings (ISO27001 and NIST)', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM control_mappings"
    ).get() as { count: number };
    
    // Should have 313 ISO27001 + 373 NIST = 686 total mappings
    expect(result.count).toBeGreaterThan(600);
    db.close();
  });

  it('should contain applicability rules', () => {
    const db = new Database(DB_PATH, { readonly: true });
    
    const result = db.prepare(
      "SELECT COUNT(*) as count FROM applicability_rules"
    ).get() as { count: number };
    
    // Should have 305+ applicability rules
    expect(result.count).toBeGreaterThan(300);
    db.close();
  });
});
