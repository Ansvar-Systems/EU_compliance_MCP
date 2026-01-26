import type { Database } from 'better-sqlite3';

export interface MapControlsInput {
  framework: 'ISO27001';
  control?: string;
  regulation?: string;
}

export interface ControlMappingEntry {
  regulation: string;
  articles: string[];
  coverage: 'full' | 'partial' | 'related';
  notes: string | null;
}

export interface ControlMapping {
  control_id: string;
  control_name: string;
  mappings: ControlMappingEntry[];
}

export async function mapControls(
  db: Database,
  input: MapControlsInput
): Promise<ControlMapping[]> {
  const { control, regulation } = input;

  let sql = `
    SELECT
      control_id,
      control_name,
      regulation,
      articles,
      coverage,
      notes
    FROM control_mappings
    WHERE 1=1
  `;

  const params: string[] = [];

  if (control) {
    sql += ` AND control_id = ?`;
    params.push(control);
  }

  if (regulation) {
    sql += ` AND regulation = ?`;
    params.push(regulation);
  }

  sql += ` ORDER BY control_id, regulation`;

  const rows = db.prepare(sql).all(...params) as Array<{
    control_id: string;
    control_name: string;
    regulation: string;
    articles: string;
    coverage: 'full' | 'partial' | 'related';
    notes: string | null;
  }>;

  // Group by control_id
  const controlMap = new Map<string, ControlMapping>();

  for (const row of rows) {
    if (!controlMap.has(row.control_id)) {
      controlMap.set(row.control_id, {
        control_id: row.control_id,
        control_name: row.control_name,
        mappings: [],
      });
    }

    controlMap.get(row.control_id)!.mappings.push({
      regulation: row.regulation,
      articles: JSON.parse(row.articles),
      coverage: row.coverage,
      notes: row.notes,
    });
  }

  return Array.from(controlMap.values());
}
