# Chassis License Catalog

The license catalog + cosign signature bundle that every per-MCP image embeds
to satisfy mcp-base Gate 3 (license catalog signature + digest).

## Why these files live here, not fetched at build time

The catalog is produced by `Ansvar-Systems/Ansvar-Architecture-Documentation`,
which is a **private** repo. Its release assets cannot be downloaded
anonymously — and authenticated downloads at build time would require
threading a GitHub token through every per-MCP Dockerfile.

Committing the artifacts here makes per-MCP builds hermetic (no network at
build time beyond the chassis base image pull) and side-steps the auth
plumbing.

## Files

| File | Purpose |
|---|---|
| `license-catalog.json` | The catalog itself; chassis verifies `sha256(file) == MCP_CATALOG_SHA` |
| `license-catalog.json.bundle` | cosign keyless signature; chassis verifies against `ARCH_DOCS_CATALOG_IDENTITY` |
| `CATALOG_SHA.txt` | Pointer to the catalog version currently embedded (the sha256, also encoded in the arch-docs release tag `license-catalog-<sha>`) |

## How to bump

When arch-docs publishes a new catalog (release tag like
`license-catalog-<new-sha>`):

```bash
RELEASE_TAG="license-catalog-<new-sha>"
gh release download "$RELEASE_TAG" \
  -R Ansvar-Systems/Ansvar-Architecture-Documentation \
  -p 'license-catalog.json' \
  -p 'license-catalog.json.bundle' \
  -D chassis-catalog/ --clobber

echo "<new-sha>" > chassis-catalog/CATALOG_SHA.txt
# Update CATALOG_SHA default in every mcps/*/Dockerfile.canonical
```

The per-Dockerfile bump can be automated in a follow-up workflow
(`fleet-catalog-bump.yml`) that runs on a schedule and opens a PR.
