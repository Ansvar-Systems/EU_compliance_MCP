/**
 * inject-term-bridge.ts — additively add the WS4 `term_bridge` table to the
 * committed `data/regulations.db`, in place, idempotently.
 *
 * WHY a separate injector instead of `npm run build:db`: the full builder
 * currently crashes on the committed seeds (`reg.articles is not iterable` —
 * a pre-existing malformed regulation seed, tracked separately), so it cannot
 * regenerate the committed DB. The committed `regulations.db` is the source of
 * truth (it carries the WS2 heading-bleed repair and all 5,132 provisions). This
 * script touches ONLY the term_bridge table — every other table is preserved
 * byte-for-byte — so WS4 ships without risking a full-corpus regression. The
 * same table DDL + seed live in `scripts/build-db.ts`, so when the builder is
 * fixed it produces an identical term_bridge natively; this injector is then a
 * no-op (CREATE IF NOT EXISTS + INSERT OR IGNORE).
 *
 * Run with: npx tsx scripts/inject-term-bridge.ts
 * Then recompute manifest.data.database_sha256 (see the printed sha256).
 */
import Database from 'better-sqlite3';
import { readFileSync, existsSync } from 'fs';
import { createHash } from 'crypto';
import { join } from 'path';

const DATA_DIR = join(import.meta.dirname, '..', 'data');
const DB_PATH = process.env.DB_PATH ?? join(DATA_DIR, 'regulations.db');
const SEED = join(DATA_DIR, 'seed', 'term-bridge.json');

const db = new Database(DB_PATH);
db.pragma('journal_mode = DELETE'); // keep the committed artifact a single file (no -wal/-shm)

db.exec(`
  CREATE TABLE IF NOT EXISTS term_bridge (
    id         INTEGER PRIMARY KEY,
    term       TEXT NOT NULL,
    expansion  TEXT NOT NULL,
    UNIQUE(term, expansion)
  );
  CREATE INDEX IF NOT EXISTS idx_term_bridge_term ON term_bridge(term COLLATE NOCASE);
`);

if (!existsSync(SEED)) {
  console.error(`term-bridge seed not found: ${SEED}`);
  process.exit(1);
}
const parsed = JSON.parse(readFileSync(SEED, 'utf-8'));
const bridges: Record<string, string[]> = parsed.bridges ?? {};
const insert = db.prepare('INSERT OR IGNORE INTO term_bridge (term, expansion) VALUES (?, ?)');
let n = 0;
const tx = db.transaction(() => {
  for (const [term, expansions] of Object.entries(bridges)) {
    for (const expansion of expansions) {
      insert.run(term.toLowerCase(), expansion);
      n++;
    }
  }
});
tx();
const rows = db.prepare('SELECT COUNT(*) c FROM term_bridge').get() as { c: number };
console.log(`term_bridge: inserted ${n} (table now ${rows.c} rows)`);
db.close();

const sha = createHash('sha256').update(readFileSync(DB_PATH)).digest('hex');
console.log(`\ndata/regulations.db sha256: sha256:${sha}`);
console.log('→ set manifest.data.database_sha256 + snapshot_id to that value.');
