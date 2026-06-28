// Contract test: every delegated/implementing act that get_regulation_guide
// advertises under "search these as separate regulation IDs" MUST resolve to a
// real corpus framework id, and every act flagged `ingested: false` MUST be
// genuinely absent. This is the durable guard for the guide<->corpus drift that
// let the guide point callers at ids that error ("unknown framework", e.g. the
// old CRA_IR_PRODUCT_CATEGORIES / CRA_DA_CSIRT_DELAY).
//
// Source of truth = source_registry in the SHIPPED data/regulations.db (the same
// file the Dockerfile bakes), so guide text can never claim searchability the
// deployed corpus does not actually provide.

import { describe, it, expect, beforeAll } from 'vitest';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readdirSync, readFileSync } from 'fs';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const DB_PATH = join(REPO_ROOT, 'data', 'regulations.db');
const GUIDES_DIR = join(REPO_ROOT, 'data', 'guides');

interface DelegatedAct {
  id: string;
  celex_id: string;
  ingested?: boolean;
}

let resolvable: Set<string>;
let guides: { file: string; acts: DelegatedAct[] }[];

beforeAll(() => {
  const db = new Database(DB_PATH, { readonly: true });
  const rows = db
    .prepare('SELECT DISTINCT regulation FROM source_registry')
    .all() as { regulation: string }[];
  resolvable = new Set(rows.map((r) => r.regulation));
  db.close();

  guides = readdirSync(GUIDES_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const g = JSON.parse(readFileSync(join(GUIDES_DIR, f), 'utf8'));
      return { file: f, acts: (g.delegated_acts ?? []) as DelegatedAct[] };
    });
});

describe('guide delegated_acts <-> corpus reconciliation', () => {
  it('loads guides and a non-empty resolvable set', () => {
    expect(resolvable.size).toBeGreaterThan(0);
    expect(guides.length).toBeGreaterThan(0);
  });

  it('every searchable delegated act resolves in the corpus', () => {
    const broken: string[] = [];
    for (const g of guides) {
      for (const a of g.acts) {
        if (a.ingested === false) continue;
        if (!resolvable.has(a.id)) broken.push(`${g.file}: ${a.id} (${a.celex_id})`);
      }
    }
    expect(
      broken,
      `guide advertises non-resolvable framework id(s) as searchable:\n${broken.join('\n')}`,
    ).toEqual([]);
  });

  it('every act flagged ingested:false is genuinely absent from the corpus', () => {
    const mislabeled: string[] = [];
    for (const g of guides) {
      for (const a of g.acts) {
        if (a.ingested === false && resolvable.has(a.id)) {
          mislabeled.push(`${g.file}: ${a.id} is in the corpus but flagged ingested:false`);
        }
      }
    }
    expect(mislabeled, mislabeled.join('\n')).toEqual([]);
  });
});
