// Per-row `_citation` builder for EU extension handlers.
//
// Extension tools (compare_requirements, …) build their own response rows and
// therefore must attach the SAME `_citation` envelope that the reference-grade
// chassis tools (`search` / `get_provision`) emit, so a customer agent gets a
// uniform citation shape regardless of which tool produced the row.
//
// mcp-base's `buildCitation` (src/core/citation/builder.ts) is NOT statically
// importable here — mcp-base ships into the chassis image via the Dockerfile
// `FROM` and is loaded at runtime, with only a structural type subset declared
// locally (see ./types.ts). This module replicates the *single-publisher,
// single-license* branch of `buildCitation` that the eu-regulations corpus
// uses, field-for-field, so extension-tool rows are byte-shape-compatible with
// the chassis output. Keep in sync with mcp-base buildCitation.

/**
 * The canonical `_citation` envelope — a subset of mcp-base's CitationEnvelope.
 * `source_url` / `publisher` / `license` are the airtight Source-Attribution
 * triple (Gate 13); `lookup` carries the round-trip pointer back to the
 * provision-addressable tool.
 */
export interface CitationEnvelope {
  source_url: string;
  publisher: string;
  license: string;
  canonical_ref: string;
  display_text: string;
  lookup: { tool: string; args: Record<string, unknown> };
  article?: string;
  effective_date?: string;
  source_full_name?: string;
  source_format?: string;
}

/** Structural subset of the chassis manifest the citation builder reads. */
export interface CitationManifest {
  attribution?: { publisher?: string | string[] };
  licensing?: { license_code?: string };
}

/** A provision row's citation inputs (the columns an extension query SELECTs). */
export interface ProvisionCitationInput {
  canonical_ref: string;
  display_text: string;
  source_url?: string | null;
  /** Per-row license (content.license_code); wins over the manifest default. */
  license_code?: string | null;
  source_full_name?: string | null;
  effective_date?: string | null;
  source_format?: string | null;
  article?: string | null;
}

export type CitationResult =
  | { ok: true; citation: CitationEnvelope }
  | { ok: false; missing: string[] };

/**
 * Resolve the single-publisher value from the manifest. eu-regulations is a
 * single-publisher corpus (Publications Office of the European Union). A
 * multi-publisher manifest (publisher: string[]) would require a per-row
 * publisher that extension rows do not carry — treated as unresolved
 * (fail-closed) rather than guessing one of the array entries.
 */
function resolvePublisher(manifest: CitationManifest): string | undefined {
  const p = manifest.attribution?.publisher;
  return typeof p === 'string' && p.length > 0 ? p : undefined;
}

/**
 * Build one `_citation` envelope for a provision row, mirroring mcp-base
 * `buildCitation`'s single-publisher / single-license logic:
 *   - source_url required (no fabrication — a missing URL fails the row),
 *   - per-row license_code wins over the manifest `licensing.license_code`,
 *   - publisher comes from the manifest.
 *
 * Returns the missing-field list instead of throwing so callers can
 * skip-and-count incomplete rows and report the omission honestly — never
 * emitting a row whose citation triple is incomplete (conformance I5).
 */
export function buildProvisionCitation(
  input: ProvisionCitationInput,
  manifest: CitationManifest,
): CitationResult {
  const missing: string[] = [];

  const sourceUrl =
    input.source_url && input.source_url.length > 0 ? input.source_url : undefined;
  if (!sourceUrl) missing.push('source_url');

  const publisher = resolvePublisher(manifest);
  if (!publisher) missing.push('publisher');

  const rowLicense =
    typeof input.license_code === 'string' && input.license_code.length > 0
      ? input.license_code
      : undefined;
  const license = rowLicense ?? manifest.licensing?.license_code ?? undefined;
  if (!license) missing.push('license');

  if (missing.length > 0) return { ok: false, missing };

  const citation: CitationEnvelope = {
    source_url: sourceUrl as string,
    publisher: publisher as string,
    license: license as string,
    canonical_ref: input.canonical_ref,
    display_text: input.display_text,
    // eu-regulations is a statute/provision corpus keyed by canonical_ref
    // (routing-table lookup_arg_keys: ["canonical_ref"]) → get_provision.
    lookup: { tool: 'get_provision', args: { canonical_ref: input.canonical_ref } },
  };
  if (input.article != null) citation.article = input.article;
  if (input.effective_date != null) citation.effective_date = input.effective_date;
  if (input.source_full_name != null) citation.source_full_name = input.source_full_name;
  if (input.source_format != null) citation.source_format = input.source_format;
  return { ok: true, citation };
}
