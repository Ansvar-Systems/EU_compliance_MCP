import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
let dbPath: string;
let workdir: string;

beforeAll(() => {
  workdir = mkdtempSync(join(tmpdir(), 'eu-fts-'));
  const seedDir = join(workdir, 'seed');
  mkdirSync(seedDir, { recursive: true });
  writeFileSync(
    join(seedDir, 'tiny.json'),
    JSON.stringify({
      id: 'TINY', full_name: 'Tiny Regulation', celex_id: '32024R9999',
      articles: [{ number: '5', title: 'Prohibited AI practices', text: 'The following AI practices shall be prohibited.' }],
    }),
  );
  dbPath = join(workdir, 'tiny.db');
  execFileSync('pnpm', ['tsx', 'scripts/build-db.ts'], {
    cwd: REPO, env: { ...process.env, SEED_DIR: seedDir, DB_PATH: dbPath }, stdio: 'pipe',
  });
});
afterAll(() => rmSync(workdir, { recursive: true, force: true }));

describe('content_fts has the fleet (body, title) shape', () => {
  it('content_fts exposes a title column', () => {
    const db = new Database(dbPath, { readonly: true });
    const cols = db.prepare('PRAGMA table_info(content_fts)').all().map((c: any) => c.name);
    db.close();
    expect(cols).toContain('body');
    expect(cols).toContain('title');
  });
  it('content_fts uses the porter tokenizer', () => {
    const db = new Database(dbPath, { readonly: true });
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name='content_fts'").get() as { sql: string };
    db.close();
    expect(sql.sql).toContain("tokenize='porter unicode61'");
  });
  it('the title column is populated and porter-stemmed search matches it', () => {
    const db = new Database(dbPath, { readonly: true });
    // porter stems "prohibited" -> "prohibit"; a title MATCH on the stem must hit.
    const n = (db.prepare("SELECT COUNT(*) c FROM content_fts WHERE content_fts MATCH 'title:prohibit'").get() as { c: number }).c;
    db.close();
    expect(n).toBeGreaterThanOrEqual(1);
  });
});
