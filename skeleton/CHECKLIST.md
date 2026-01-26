# New MCP Server Checklist

> Step-by-step guide for creating a new MCP server from the skeleton

Use this checklist when creating a new MCP server in the Ansvar ecosystem.

---

## Phase 1: Setup

### 1.1 Create Repository

- [ ] Create new GitHub repository in `ansvar-systems` organization
- [ ] Clone skeleton to new directory:
  ```bash
  cp -r skeleton/ ../your-mcp-server/
  cd ../your-mcp-server/
  git init
  ```

### 1.2 Update Package Identity

Edit `package.json`:

- [ ] Update `name` to `@ansvar/your-mcp-server`
- [ ] Update `description`
- [ ] Update `repository.url`
- [ ] Update `bugs.url`
- [ ] Update `homepage`
- [ ] Update `keywords`
- [ ] Update `bin` key to match server name

### 1.3 Update Server Configuration

Edit `src/index.ts`:

- [ ] Update `SERVER_NAME` constant
- [ ] Update `SERVER_VERSION` constant
- [ ] Update `DB_ENV_VAR` constant

### 1.4 Claim Namespaces

- [ ] Verify `@ansvar` npm scope access
- [ ] Create Docker Hub repository (if using Docker)

---

## Phase 2: Data Model

### 2.1 Design Schema

- [ ] Document entities and relationships
- [ ] Create database schema in `scripts/build-db.ts`
- [ ] Define seed file format

### 2.2 Create Sample Data

- [ ] Create sample seed file in `data/seed/sample.json`
- [ ] Include edge cases (nulls, special chars)

### 2.3 Build Test Database

Edit `tests/fixtures/test-db.ts`:

- [ ] Update `SCHEMA` to match production
- [ ] Create `SAMPLE_SOURCES` with test data
- [ ] Create `SAMPLE_ITEMS` with test data
- [ ] Add other sample data as needed

---

## Phase 3: Ingestion

### 3.1 Implement Ingestion Script

Edit `scripts/ingest-source.ts`:

- [ ] Update `SOURCE_BASE_URL`
- [ ] Add entries to `KNOWN_SOURCES`
- [ ] Implement `extractItems()` for your source
- [ ] Implement `extractDefinitions()` for your source
- [ ] Test with sample source

### 3.2 Ingest All Data

```bash
npm run ingest -- <id1> data/seed/source1.json
npm run ingest -- <id2> data/seed/source2.json
# ...
```

- [ ] Ingest all sources
- [ ] Verify seed files are complete
- [ ] Build database: `npm run build:db`

---

## Phase 4: Tools

### 4.1 Implement Tools

For each tool:

- [ ] Create tool file in `src/tools/`
- [ ] Define input/output interfaces
- [ ] Implement main function
- [ ] Add helper functions as needed

### 4.2 Register Tools

Edit `src/index.ts`:

- [ ] Add tool definition to `TOOLS` array
- [ ] Add case to `CallToolRequestSchema` handler
- [ ] Import tool function

### 4.3 Test Tools

For each tool:

- [ ] Create test file in `tests/tools/`
- [ ] Test happy path
- [ ] Test edge cases
- [ ] Test error handling
- [ ] Run tests: `npm test`

---

## Phase 5: Documentation

### 5.1 README.md

- [ ] Write clear description
- [ ] Document installation methods (npm, Docker, source)
- [ ] List all available tools with examples
- [ ] Add usage examples
- [ ] Include configuration options

### 5.2 COVERAGE.md

- [ ] List all included sources
- [ ] Document version/date of each source
- [ ] Note any known gaps or limitations

### 5.3 CONTRIBUTING.md

- [ ] Explain how to set up development environment
- [ ] Document coding conventions
- [ ] Explain pull request process

### 5.4 LICENSE

- [ ] Add Apache 2.0 license file

---

## Phase 6: Quality

### 6.1 Testing

- [ ] Run all tests: `npm test`
- [ ] Check coverage: `npm run test:coverage`
- [ ] Ensure >80% coverage

### 6.2 Build

- [ ] TypeScript compiles: `npm run build`
- [ ] No type errors
- [ ] No warnings

### 6.3 Manual Testing

- [ ] Test with MCP Inspector:
  ```bash
  npx @anthropic/mcp-inspector node dist/index.js
  ```
- [ ] Test each tool manually
- [ ] Verify results are correct

---

## Phase 7: Deployment

### 7.1 Configuration Files

- [ ] Update `Dockerfile` with correct env var
- [ ] Update `smithery.yaml` with correct info
- [ ] Verify `.gitignore` is complete

### 7.2 CI/CD

- [ ] Test CI workflow locally
- [ ] Set up `NPM_TOKEN` secret in repository
- [ ] (Optional) Set up Docker Hub secrets

### 7.3 Initial Commit

```bash
git add .
git commit -m "Initial commit: [Server Name] MCP server"
git remote add origin git@github.com:ansvar-systems/your-mcp-server.git
git push -u origin main
```

---

## Phase 8: Release

### 8.1 Version and Tag

```bash
# Ensure version in package.json is correct (0.1.0)
git tag v0.1.0
git push origin v0.1.0
```

### 8.2 Verify Publication

- [ ] npm package published
- [ ] (Optional) Docker image pushed

### 8.3 Submit to Registries

- [ ] Smithery: https://smithery.ai/submit
- [ ] Glama: https://glama.ai/mcp/servers
- [ ] Open PR to awesome-mcp-servers

### 8.4 Announce

- [ ] LinkedIn post
- [ ] r/mcp Reddit post
- [ ] (Optional) Blog post

---

## Maintenance

### Ongoing Tasks

- [ ] Set up weekly `npm run check-updates`
- [ ] Monitor for issues and PRs
- [ ] Update dependencies periodically
- [ ] Re-ingest when sources update

### Version Bumps

```bash
# For bug fixes
npm version patch  # 0.1.0 → 0.1.1

# For new features
npm version minor  # 0.1.0 → 0.2.0

# For breaking changes
npm version major  # 0.1.0 → 1.0.0

# Push with tags
git push origin main --tags
```

---

## Quick Commands Reference

```bash
# Development
npm run dev              # Run server directly
npm run build            # Compile TypeScript
npm test                 # Run tests
npm run test:coverage    # Run tests with coverage

# Data
npm run ingest -- <id> <output>  # Ingest source
npm run build:db                  # Build database
npm run check-updates             # Check for updates

# Release
npm version <patch|minor|major>   # Bump version
git push origin main --tags       # Trigger release
```

---

<p align="center">
<strong>Ansvar Systems AB</strong><br>
ansvar.ai
</p>
