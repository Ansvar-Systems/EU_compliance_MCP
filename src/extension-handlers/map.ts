import type { ExtensionTool, ToolHandler } from './types.js';
import { textResult, errorResult } from './types.js';

interface MapRow {
  control_id: string;
  control_name: string;
  regulation: string;
  articles: string;
  coverage: 'full' | 'partial' | 'related';
  notes: string | null;
}

const VALID_FRAMEWORKS = ['ISO27001', 'NIST_CSF'] as const;

const handler: ToolHandler = async (args, ctx) => {
  const framework = typeof args.framework === 'string' ? args.framework : undefined;
  const control = typeof args.control === 'string' ? args.control : undefined;
  const regulation = typeof args.regulation === 'string' ? args.regulation : undefined;
  let limit = typeof args.limit === 'number' ? args.limit : 100;
  if (!Number.isFinite(limit) || limit < 0) limit = 100;
  limit = Math.min(Math.floor(limit), 1000);

  if (!framework || !VALID_FRAMEWORKS.includes(framework as (typeof VALID_FRAMEWORKS)[number])) {
    return errorResult(
      `map_controls: framework is required and must be one of: ${VALID_FRAMEWORKS.join(', ')}`,
    );
  }

  let sql = `
    SELECT control_id, control_name, regulation, articles, coverage, notes
    FROM control_mappings
    WHERE framework = ?
  `;
  const params: unknown[] = [framework];
  if (control) {
    sql += ` AND control_id = ?`;
    params.push(control);
  }
  if (regulation) {
    sql += ` AND regulation = ?`;
    params.push(regulation);
  }
  sql += ` ORDER BY control_id, regulation LIMIT ?`;
  params.push(limit);

  try {
    const rows = ctx.db.prepare(sql).all(...params) as MapRow[];
    const grouped = new Map<
      string,
      {
        control_id: string;
        control_name: string;
        mappings: Array<{
          regulation: string;
          articles: string[];
          coverage: 'full' | 'partial' | 'related';
          notes: string | null;
        }>;
      }
    >();
    for (const row of rows) {
      if (!grouped.has(row.control_id)) {
        grouped.set(row.control_id, {
          control_id: row.control_id,
          control_name: row.control_name,
          mappings: [],
        });
      }
      grouped.get(row.control_id)!.mappings.push({
        regulation: row.regulation,
        articles: row.articles ? JSON.parse(row.articles) : [],
        coverage: row.coverage,
        notes: row.notes,
      });
    }
    const results = Array.from(grouped.values());
    return textResult({ framework, count: results.length, controls: results });
  } catch (e) {
    return errorResult(`map_controls: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const mapControlsTool: ExtensionTool = {
  definition: {
    name: 'map_controls',
    description:
      'Map ISO 27001 or NIST CSF controls to EU regulation articles. Returns control-by-control coverage with full/partial/related markers, applicable articles, and notes. Filter by control_id or regulation.',
    inputSchema: {
      type: 'object',
      properties: {
        framework: {
          type: 'string',
          enum: ['ISO27001', 'NIST_CSF'],
          description: 'Control framework to map from.',
        },
        control: {
          type: 'string',
          description: 'Specific control ID to filter (e.g. "A.5.1", "PR.AC-1").',
        },
        regulation: {
          type: 'string',
          description: 'Regulation ID to filter mappings (e.g. "DORA", "NIS2").',
        },
        limit: {
          type: 'number',
          description: 'Max result rows (default 100, max 1000).',
        },
      },
      required: ['framework'],
    },
  },
  handler,
};
