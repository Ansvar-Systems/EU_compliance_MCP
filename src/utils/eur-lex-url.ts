/**
 * EUR-Lex ELI URL builders.
 *
 * CELEX ids identify an act uniquely but point to the ``legal-content``
 * landing page, which isn't the citation contract in
 * ``docs/guides/law-mcp-golden-standard.md`` §4.9b
 * (``source_url`` = "Official portal URL for the specific provision").
 * ELI URIs are provision-addressable: ``#art_N`` for articles,
 * ``#rct_N`` for recitals, so consumers rendering a citation chip can
 * open directly on the cited provision rather than at the top of the
 * consolidated text.
 *
 * CELEX → ELI mapping (see EUR-Lex documentation):
 *   ``3YYYY{T}NNNN``
 *     - first digit ``3`` (secondary legislation)
 *     - ``YYYY`` four-digit year of adoption
 *     - ``T`` sector letter (``R`` regulation, ``L`` directive,
 *       ``D`` decision)
 *     - ``NNNN`` document number (leading zeros stripped in the ELI path)
 *
 * Unrecognized CELEX sector letters and malformed inputs return ``null``
 * so callers can omit ``source_url`` rather than emit a broken URL.
 */

const ELI_BASE = 'https://eur-lex.europa.eu/eli';

const CELEX_TO_ELI_TYPE: Record<string, string> = {
  R: 'reg',
  L: 'dir',
  D: 'dec',
};

const ARTICLE_NUMERIC_RE = /^\d+[a-z]?$/i;

/**
 * Build the regulation-level ELI URL for a CELEX id.
 *
 * Returns ``null`` if the CELEX is missing, malformed, or uses a
 * sector letter outside the supported R/L/D set. Callers should treat a
 * null return as "omit ``source_url`` from the citation".
 */
export function celexToEliBase(celexId: string | null | undefined): string | null {
  if (!celexId) return null;
  const match = celexId.match(/^3(\d{4})([A-Z])(\d+)$/);
  if (!match) return null;
  const [, year, type, num] = match;
  const eliType = CELEX_TO_ELI_TYPE[type];
  if (!eliType) return null;
  const numClean = String(parseInt(num, 10));
  return `${ELI_BASE}/${eliType}/${year}/${numClean}/oj`;
}

/**
 * Build a provision-specific ELI URL for an article.
 *
 * Numeric article numbers (``32``, ``5a``) get a ``#art_N`` anchor.
 * Annex references (``Annex I``) fall back to the regulation-level URL
 * because ELI annex anchoring isn't uniformly published across EUR-Lex
 * and a working regulation-level link beats a broken anchor.
 */
export function buildArticleSourceUrl(
  celexId: string | null | undefined,
  articleNumber: string,
): string | null {
  const base = celexToEliBase(celexId);
  if (!base) return null;
  if (ARTICLE_NUMERIC_RE.test(articleNumber)) {
    return `${base}#art_${articleNumber}`;
  }
  return base;
}

/**
 * Build a provision-specific ELI URL for a recital.
 */
export function buildRecitalSourceUrl(
  celexId: string | null | undefined,
  recitalNumber: number,
): string | null {
  const base = celexToEliBase(celexId);
  if (!base) return null;
  return `${base}#rct_${recitalNumber}`;
}
