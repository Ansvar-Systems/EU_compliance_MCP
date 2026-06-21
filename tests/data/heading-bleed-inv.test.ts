import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import { headingLike } from '../../scripts/fix-heading-bleed-seeds.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', '..', 'data', 'regulations.db');
let db: Database.Database;
beforeAll(() => { db = new Database(DB_PATH, { readonly: true }); });
afterAll(() => db.close());

describe('regulations.db heading-bleed invariant (WS2 gate)', () => {
  it('no substantive provision body ends in a structural heading; bleedPct < 1.0', () => {
    const rows = db
      .prepare(
        `SELECT canonical_ref ref, body FROM provisions
         WHERE body IS NOT NULL AND length(trim(body)) >= 3
           AND canonical_ref NOT LIKE '%:meta' AND canonical_ref NOT LIKE '%:hd'`,
      )
      .all() as { ref: string; body: string }[];
    let bleed = 0;
    const offenders: string[] = [];
    for (const r of rows) {
      const lines = String(r.body).replace(/\s+$/, '').split('\n').filter((l) => l.trim());
      if (lines.slice(-3).some(headingLike)) {
        bleed++;
        if (offenders.length < 5) offenders.push(`${r.ref} | ${lines.slice(-1)[0]}`);
      }
    }
    const bleedPct = rows.length ? (1000 * bleed) / rows.length / 10 : 0;
    expect(bleedPct, `bleedPct=${bleedPct}% offenders=${offenders.join(' ; ')}`).toBeLessThan(1.0);
  });

  it('AI_ACT:art_4 / art_5 carry no trailing heading tail', () => {
    const get = (ref: string) =>
      (db.prepare('SELECT body FROM provisions WHERE canonical_ref = ?').get(ref) as { body: string }).body;
    expect(get('AI_ACT:art_4').trimEnd()).not.toMatch(/PROHIBITED AI PRACTICES$/);
    expect(get('AI_ACT:art_5').trimEnd()).not.toMatch(/(HIGH-RISK AI SYSTEMS|Classification of AI systems as high-risk)$/);
  });
});
