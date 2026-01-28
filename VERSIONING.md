# Versioning & Naming Strategy

**Last Updated:** 2026-01-28

## Version Synchronization

All platform versions MUST match the npm package version. When bumping version:

```bash
# 1. Update package.json (this is the source of truth)
npm version patch|minor|major

# 2. Sync all manifests
node scripts/sync-versions.js  # TODO: Create this script

# 3. Commit and tag
git add .
git commit -m "chore: bump version to vX.Y.Z"
git push && git push --tags
```

### Files That Must Be Updated

| File | Field | Current | Auto-sync? |
|------|-------|---------|------------|
| `package.json` | `version` | 0.5.0 | ✅ Source of truth |
| `packages/core/package.json` | `version` | 0.5.0 | ✅ Via `sync-versions` |
| `packages/mcp-server/package.json` | `version` | 0.5.0 | ✅ Via `sync-versions` |
| `packages/rest-api/package.json` | `version` | 0.5.0 | ✅ Via `sync-versions` |
| `packages/teams-extension/manifest.json` | `version` | 0.5.0 | ✅ Via `sync-versions` |
| `server.json` | `version`, `packages[].version` | 0.6.5 | ✅ Via `sync-versions` |

**✅ DONE:** `scripts/sync-versions.ts` automates workspace version updates - run `pnpm run sync-versions` after bumping root version.

## Naming Conventions

### Package Names (Technical Identifiers)

These are used for package management and should remain consistent:

- **npm:** `@ansvar/eu-regulations-mcp`
- **MCP Protocol:** `eu.ansvar/eu-regulations-mcp` (from `mcpName` field)
- **Docker:** `eu-regulations` (Azure Container Registry)
- **Teams Package:** `com.ansvar.eu-regulations`

### Display Names (User-Facing)

These can vary by context for better UX:

- **npm title:** "EU Regulations MCP"
- **MCP Server:** "EU Regulations MCP Server"
- **Copilot Agent:** "EU Compliance Advisor" (more conversational)
- **Teams:** "EU Regulations" (short for UI)
- **Teams Full:** "EU Regulations Compliance Reference"

### Marketplace Identifiers

| Platform | Identifier | Controlled By | Notes |
|----------|-----------|---------------|-------|
| **npm** | `@ansvar/eu-regulations-mcp` | package.json | ✅ Org account |
| **MCP Registry** | `eu.ansvar/eu-regulations-mcp` | server.json | ✅ Official registry |
| **Copilot** | TBD | Azure App Registration | Future |
| **Teams** | TBD | Teams App ID | Future |

## Platform-Specific Guidelines

### npm Registry

- **Scope:** `@ansvar` (organization)
- **Package:** `eu-regulations-mcp`
- **Full:** `@ansvar/eu-regulations-mcp`
- **Version:** Semantic versioning (X.Y.Z)
- **Publishing:** Automated via `.github/workflows/publish.yml`

### Official MCP Registry

- **Name:** `eu.ansvar/eu-regulations-mcp`
- **Repository:** `https://github.com/Ansvar-Systems/EU_compliance_MCP`
- **Version:** Auto-syncs from npm package via server.json
- **Config:** `server.json`
- **Registry:** Model Context Protocol official registry

### Microsoft Copilot & Teams

- **Agent Name:** "EU Compliance Advisor"
- **Package:** `com.ansvar.eu-regulations`
- **Manifests:**
  - `declarative-agent-manifest.json` (Copilot Studio)
  - `packages/teams-extension/manifest.json` (Teams App)
- **Publishing:** Future - via Microsoft Partner Center

## Consistency Checklist

Before releasing a new version:

- [ ] Update `package.json` version (source of truth)
- [ ] Run `pnpm run sync-versions` to update all workspace packages
- [ ] Update Teams manifest version (if applicable)
- [ ] Update article/recital counts in declarative agent manifest (if changed)
- [ ] Run tests (`npm test`)
- [ ] Create git tag (`git tag vX.Y.Z`)
- [ ] Push tag (triggers publish workflow)

## Breaking Changes

When making breaking changes:

1. **Bump major version** (e.g., 0.5.0 → 1.0.0)
2. **Update all manifests** with new capabilities
3. **Update CHANGELOG.md** with migration guide
4. **Notify users** via:
   - GitHub release notes
   - Discord/Slack webhooks (if configured)
   - README banner (for critical changes)

## Version History

| Version | Date | Platforms Updated | Notes |
|---------|------|-------------------|-------|
| 0.6.5 | 2026-01-28 | npm, MCP Registry | Removed third-party registries |
| 0.5.0 | 2026-01-27 | npm | Evidence mapping, DORA RTS |
| 0.4.1 | 2025-XX-XX | npm | Webhook notifications |
| 0.4.0 | 2025-XX-XX | npm | Pre-built database |

## Future Improvements

1. **Automated version sync script** (`scripts/sync-versions.ts`)
   - Read version from root package.json
   - Update all workspace packages
   - Update manifest files
   - Validate consistency

2. **Pre-release validation**
   - GitHub Action to verify all versions match
   - Block publish if inconsistent
   - Add to `publish.yml` workflow

3. **Marketplace presence**
   - Publish to Microsoft Commercial Marketplace (Copilot)
   - Monitor new MCP registries as they emerge
   - Ensure consistent branding across all platforms

## Contact

For questions about versioning strategy:
- **GitHub:** Open an issue with `versioning` label
- **Email:** hello@ansvar.eu
