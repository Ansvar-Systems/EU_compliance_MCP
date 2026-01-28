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
| `packages/core/package.json` | `version` | 0.4.1 | ❌ Manual |
| `packages/mcp-server/package.json` | `version` | 0.4.1 | ❌ Manual |
| `packages/rest-api/package.json` | `version` | 0.4.1 | ❌ Manual |
| `packages/teams-extension/manifest.json` | `version` | 0.5.0 | ❌ Manual |
| `smithery.yaml` | - | N/A | ✅ Auto from npm |
| `glama.json` | - | N/A | ✅ Auto from npm |

**TODO:** Create `scripts/sync-versions.ts` to automate workspace version updates.

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
- **Smithery:** "EU Regulations MCP Server"
- **Copilot Agent:** "EU Compliance Advisor" (more conversational)
- **Teams:** "EU Regulations" (short for UI)
- **Teams Full:** "EU Regulations Compliance Reference"

### Marketplace Identifiers

| Platform | Identifier | Controlled By | Notes |
|----------|-----------|---------------|-------|
| **npm** | `@ansvar/eu-regulations-mcp` | package.json | ✅ Org account |
| **Smithery** | `ansvar/eu_compliance_mcp` | smithery.yaml `repository` | ✅ GitHub org |
| **glama.ai** | `@Mortalus/eu-regulations` | User claim | ⚠️ Personal account |
| **Copilot** | TBD | Azure App Registration | Future |
| **Teams** | TBD | Teams App ID | Future |

## Platform-Specific Guidelines

### npm Registry

- **Scope:** `@ansvar` (organization)
- **Package:** `eu-regulations-mcp`
- **Full:** `@ansvar/eu-regulations-mcp`
- **Version:** Semantic versioning (X.Y.Z)
- **Publishing:** Automated via `.github/workflows/publish.yml`

### Smithery (MCP Registry)

- **Name:** `eu-regulations-mcp` (no org prefix needed)
- **Repository:** `https://github.com/Ansvar-Systems/EU_compliance_MCP`
- **Version:** Auto-syncs from npm package
- **Config:** `smithery.yaml`
- **URL:** `https://smithery.ai/server/ansvar/eu_compliance_mcp`

### glama.ai (MCP Marketplace)

- **Current:** `@Mortalus/eu-regulations` (personal claim)
- **Future:** Should migrate to org account if possible
- **Config:** `glama.json` (minimal - just maintainers)
- **Sync:** Auto from npm
- **Badge:** `https://glama.ai/mcp/servers/@Mortalus/eu-regulations/badge`

**TODO:** Investigate if glama.ai supports org accounts for proper branding.

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
- [ ] Update all workspace package.json versions
- [ ] Update Teams manifest version
- [ ] Update article/recital counts in declarative agent manifest
- [ ] Verify Smithery config is current
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
| 0.5.0 | 2026-01-27 | npm, Smithery, glama.ai | Evidence mapping, DORA RTS |
| 0.4.1 | 2025-XX-XX | npm, Smithery | Webhook notifications |
| 0.4.0 | 2025-XX-XX | npm, Smithery | Pre-built database |

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

3. **Org-level branding**
   - Migrate glama.ai from personal to org account (if possible)
   - Ensure all platforms use `@ansvar` or `Ansvar Systems` branding
   - Consistent logos and descriptions

4. **Marketplace presence**
   - Publish to Microsoft Commercial Marketplace (Copilot)
   - Consider AWS Marketplace (future)
   - Monitor new MCP registries

## Contact

For questions about versioning strategy:
- **GitHub:** Open an issue with `versioning` label
- **Email:** hello@ansvar.ai
