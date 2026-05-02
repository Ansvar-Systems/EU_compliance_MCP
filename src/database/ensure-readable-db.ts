import { copyFileSync, existsSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/**
 * Workaround for the node-sqlite3-wasm + Docker overlay2 incompatibility:
 * the WASM SQLite driver opens overlay-stored DBs successfully but every
 * page-level read fails with "disk I/O error" or "database is locked".
 *
 * Copy the DB to /tmp (tmpfs) once at startup; subsequent calls reuse it.
 *
 * See `docs/known-issues/wasm-sqlite-overlay-filesystem.md` in the
 * Architecture-Documentation repo. Symptom observed in production
 * 2026-05-01: every getArticle / expandRegulationFamily SQL throwing
 * SQLite3Error: database is locked from this MCP's container.
 */
export function ensureReadableDb(srcPath: string): string {
  if (srcPath.startsWith('/tmp/')) return srcPath;

  const tmpPath = join('/tmp', basename(srcPath));
  if (!existsSync(tmpPath)) {
    copyFileSync(srcPath, tmpPath);
    return tmpPath;
  }

  // If the source has been updated since the cached copy, refresh it.
  // This matters for cases where the image is rebuilt and the container
  // is restarted but /tmp persists across the same exec session.
  try {
    const srcMtime = statSync(srcPath).mtimeMs;
    const tmpMtime = statSync(tmpPath).mtimeMs;
    if (srcMtime > tmpMtime) {
      copyFileSync(srcPath, tmpPath);
    }
  } catch {
    // Fall through with the cached /tmp copy on stat errors.
  }

  return tmpPath;
}
