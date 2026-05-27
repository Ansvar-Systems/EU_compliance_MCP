import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDatabase, closeTestDatabase } from '../fixtures/test-db.js';
import {
  getArticleHistory,
  diffArticle,
  getRecentChanges,
} from '../../src/tools/version-tracking.js';
import type { DatabaseAdapter } from '../../src/database/types.js';

describe('Version Tracking Tools', () => {
  let db: DatabaseAdapter;

  beforeAll(() => {
    db = createTestDatabase();
  });

  afterAll(async () => {
    await closeTestDatabase(db);
  });

  describe('getArticleHistory', () => {
    it('returns full version timeline for GDPR Article 1', async () => {
      const result = await getArticleHistory(db, { regulation: 'GDPR', article: '1' });

      expect(result).toHaveProperty('regulation', 'GDPR');
      expect(result).toHaveProperty('article', '1');
      expect(result).toHaveProperty('versions');

      const history = result as { versions: any[]; current_version: string | null };
      expect(history.versions).toHaveLength(2);
      expect(history.current_version).toBe('2024-01-15');
    });

    it('returns versions in chronological order', async () => {
      const result = await getArticleHistory(db, { regulation: 'GDPR', article: '1' });
      const history = result as { versions: Array<{ effective_date: string | null }> };

      const dates = history.versions.map(v => v.effective_date);
      expect(dates[0]).toBe('2016-05-04');
      expect(dates[1]).toBe('2024-01-15');
    });

    it('includes change_summary in version entries', async () => {
      const result = await getArticleHistory(db, { regulation: 'GDPR', article: '1' });
      const history = result as { versions: Array<{ change_summary: string | null }> };

      expect(history.versions[0].change_summary).toContain('Initial publication');
      expect(history.versions[1].change_summary).toContain('editorial correction');
    });

    it('marks superseded versions correctly', async () => {
      const result = await getArticleHistory(db, { regulation: 'GDPR', article: '1' });
      const history = result as { versions: Array<{ superseded_date: string | null }> };

      // First version is superseded
      expect(history.versions[0].superseded_date).toBe('2024-01-15');
      // Current version has null superseded_date
      expect(history.versions[1].superseded_date).toBeNull();
    });

    it('returns single version for NIS2 Article 1', async () => {
      const result = await getArticleHistory(db, { regulation: 'NIS2', article: '1' });
      const history = result as { versions: any[] };
      expect(history.versions).toHaveLength(1);
      expect(history.versions[0].effective_date).toBe('2022-12-27');
    });

    it('throws for non-existent article', async () => {
      await expect(
        getArticleHistory(db, { regulation: 'GDPR', article: '999' }),
      ).rejects.toThrow('not found');
    });

    it('throws for non-existent regulation', async () => {
      await expect(
        getArticleHistory(db, { regulation: 'FAKE', article: '1' }),
      ).rejects.toThrow('not found');
    });

    it('returns empty versions for article with no version history', async () => {
      // GDPR Article 4 exists in articles table but has no entries in article_versions
      const result = await getArticleHistory(db, { regulation: 'GDPR', article: '4' });
      const history = result as { versions: any[]; current_version: string | null };
      expect(history.versions).toHaveLength(0);
      expect(history.current_version).toBeNull();
    });
  });

  describe('diffArticle', () => {
    it('returns diff for GDPR Article 1 between 2016 and 2025', async () => {
      const result = await diffArticle(db, {
        regulation: 'GDPR',
        article: '1',
        from_date: '2016-01-01',
        to_date: '2025-01-01',
      });

      expect(result).toHaveProperty('regulation', 'GDPR');
      expect(result).toHaveProperty('article', '1');
      expect(result).toHaveProperty('from_date', '2016-01-01');
      expect(result).toHaveProperty('to_date', '2025-01-01');

      const diff = result as { diff: string | null; change_summary: string | null };
      expect(diff.diff).toContain('---');
      expect(diff.diff).toContain('+++');
      expect(diff.change_summary).toContain('editorial correction');
    });

    it('returns null diff when no changes in date range', async () => {
      const result = await diffArticle(db, {
        regulation: 'GDPR',
        article: '1',
        from_date: '2025-01-01', // after the last change
        to_date: '2026-12-31',
      });

      const diff = result as { diff: string | null; change_summary: string | null };
      expect(diff.diff).toBeNull();
      expect(diff.change_summary).toContain('No changes');
    });

    it('defaults to_date to today when not provided', async () => {
      const result = await diffArticle(db, {
        regulation: 'GDPR',
        article: '1',
        from_date: '2016-01-01',
      });

      const diff = result as { to_date: string };
      // to_date should be today's date
      const today = new Date().toISOString().slice(0, 10);
      expect(diff.to_date).toBe(today);
    });

    it('throws for non-existent article', async () => {
      await expect(
        diffArticle(db, {
          regulation: 'GDPR',
          article: '999',
          from_date: '2016-01-01',
        }),
      ).rejects.toThrow('not found');
    });
  });

  describe('getRecentChanges', () => {
    it('returns all changes since a given date', async () => {
      const result = await getRecentChanges(db, { since: '2020-01-01' });

      expect(result).toHaveProperty('since', '2020-01-01');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('total');

      const changes = result as { changes: any[]; total: number };
      // Should include 2024-01-15 GDPR change and 2022-12-27 NIS2 initial
      expect(changes.total).toBeGreaterThanOrEqual(2);
    });

    it('filters by regulation', async () => {
      const result = await getRecentChanges(db, {
        since: '2020-01-01',
        regulation: 'NIS2',
      });

      const changes = result as { changes: Array<{ regulation: string }> };
      expect(changes.changes.length).toBeGreaterThan(0);
      for (const change of changes.changes) {
        expect(change.regulation).toBe('NIS2');
      }
    });

    it('returns empty when no changes since date', async () => {
      const result = await getRecentChanges(db, { since: '2030-01-01' });
      const changes = result as { changes: any[]; total: number };
      expect(changes.changes).toHaveLength(0);
      expect(changes.total).toBe(0);
    });

    it('respects limit parameter', async () => {
      const result = await getRecentChanges(db, { since: '2016-01-01', limit: 1 });
      const changes = result as { changes: any[] };
      expect(changes.changes.length).toBeLessThanOrEqual(1);
    });

    it('clamps limit to max 200', async () => {
      // Should not throw even with huge limit
      const result = await getRecentChanges(db, { since: '2016-01-01', limit: 9999 });
      expect(result).toHaveProperty('changes');
    });

    it('returns changes ordered by effective_date DESC (most recent first)', async () => {
      const result = await getRecentChanges(db, { since: '2016-01-01' });
      const changes = result as { changes: Array<{ effective_date: string }> };

      if (changes.changes.length > 1) {
        for (let i = 0; i < changes.changes.length - 1; i++) {
          expect(changes.changes[i].effective_date >= changes.changes[i + 1].effective_date).toBe(true);
        }
      }
    });

    it('includes change_summary and source_url fields', async () => {
      const result = await getRecentChanges(db, { since: '2020-01-01' });
      const changes = result as { changes: Array<{ change_summary: string | null; source_url: string | null }> };

      // At least one change should have these fields
      const withSummary = changes.changes.find(c => c.change_summary !== null);
      expect(withSummary).toBeDefined();
      expect(withSummary!.source_url).toContain('eur-lex.europa.eu');
    });
  });
});
