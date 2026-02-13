# MCPB Automation + ChatGPT Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create reusable GitHub workflows that auto-build `.mcpb` bundles on release for all 15 Ansvar MCP servers, fix the broken EU_compliance_MCP workflows, and add ChatGPT integration (Desktop config + Vercel-hosted Streamable HTTP).

**Architecture:** Two reusable workflows (Node.js + Python) live in `mcp-server-template`. Each MCP server repo gets a thin ~15-line caller workflow that triggers on version tags. ChatGPT Desktop support is docs-only (same `npx` command as Claude). Vercel hosting uses a serverless API route wrapping the existing Streamable HTTP server.

**Tech Stack:** GitHub Actions reusable workflows, `@anthropic-ai/mcpb` CLI, Vercel serverless functions, MCP SDK Streamable HTTP transport.

---

## Phase 1: Reusable Workflows in `mcp-server-template`

### Task 1: Create the Node.js reusable workflow

**Files:**
- Create: `/Users/jeffreyvonrotz/Projects/mcp-server-template/.github/workflows/mcpb-bundle-node.yml`

**Step 1: Write the reusable workflow**

```yaml
name: Build MCPB Bundle (Node.js)

on:
  workflow_call:
    inputs:
      server-name:
        description: 'MCP server name for the .mcpb file (e.g., eu-regulations-mcp)'
        required: true
        type: string
      node-version:
        description: 'Node.js version to use'
        required: false
        type: string
        default: '20'
      data-dir:
        description: 'Data directory to include (relative path, e.g., "data")'
        required: false
        type: string
        default: 'data'

permissions:
  contents: write

jobs:
  build-mcpb:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: ${{ inputs.node-version }}

      - name: Get version from tag
        id: version
        run: |
          if [ "${{ github.ref_type }}" = "tag" ]; then
            VERSION="${GITHUB_REF#refs/tags/v}"
          else
            VERSION=$(node -p "require('./package.json').version")
          fi
          echo "VERSION=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Install mcpb CLI
        run: npm install -g @anthropic-ai/mcpb

      - name: Build project
        run: |
          npm ci --ignore-scripts
          npm run build

      - name: Create staging directory
        run: |
          mkdir -p staging/dist

          # Copy build output
          cp -r dist/* staging/dist/

          # Copy data directory if it exists
          if [ -d "${{ inputs.data-dir }}" ]; then
            cp -r "${{ inputs.data-dir }}" staging/
          fi

          # Copy manifest
          cp manifest.json staging/

          # Create minimal package.json with only production deps
          node -e "
            const pkg = require('./package.json');
            const minimal = {
              name: pkg.name,
              version: '${{ steps.version.outputs.VERSION }}',
              description: pkg.description,
              main: pkg.main || 'dist/index.js',
              type: pkg.type || 'module',
              dependencies: pkg.dependencies || {}
            };
            require('fs').writeFileSync('staging/package.json', JSON.stringify(minimal, null, 2));
          "

      - name: Install production dependencies in staging
        working-directory: staging
        run: npm install --omit=dev

      - name: Update manifest version
        run: |
          node -e "
            const fs = require('fs');
            const m = JSON.parse(fs.readFileSync('staging/manifest.json', 'utf8'));
            m.version = '${{ steps.version.outputs.VERSION }}';
            fs.writeFileSync('staging/manifest.json', JSON.stringify(m, null, 2));
          "

      - name: Validate manifest
        run: mcpb validate staging/manifest.json

      - name: Pack MCPB bundle
        run: mcpb pack staging "${{ inputs.server-name }}.mcpb"

      - name: Show bundle info
        run: mcpb info "${{ inputs.server-name }}.mcpb"

      - name: Upload bundle artifact
        uses: actions/upload-artifact@v4
        with:
          name: mcpb-bundle
          path: ${{ inputs.server-name }}.mcpb

  release:
    needs: build-mcpb
    runs-on: ubuntu-latest
    if: github.ref_type == 'tag'
    permissions:
      contents: write

    steps:
      - name: Download bundle
        uses: actions/download-artifact@v4
        with:
          name: mcpb-bundle

      - name: Upload bundle to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ inputs.server-name }}.mcpb
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Summary
        run: |
          echo "## MCPB Bundle Uploaded" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "| File | Version |" >> "$GITHUB_STEP_SUMMARY"
          echo "|------|---------|" >> "$GITHUB_STEP_SUMMARY"
          echo "| ${{ inputs.server-name }}.mcpb | ${{ needs.build-mcpb.outputs.version || 'from tag' }} |" >> "$GITHUB_STEP_SUMMARY"
```

**Step 2: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/mcp-server-template
git add .github/workflows/mcpb-bundle-node.yml
git commit -m "feat: add reusable Node.js .mcpb bundle workflow

Reusable workflow for all Ansvar Node.js MCP servers.
Single-platform build (no native deps with WASM SQLite).
Caller repos just need manifest.json + thin workflow."
```

---

### Task 2: Create the Python reusable workflow

**Files:**
- Create: `/Users/jeffreyvonrotz/Projects/mcp-server-template/.github/workflows/mcpb-bundle-python.yml`

**Step 1: Write the reusable workflow**

```yaml
name: Build MCPB Bundle (Python)

on:
  workflow_call:
    inputs:
      server-name:
        description: 'MCP server name for the .mcpb file'
        required: true
        type: string
      python-version:
        description: 'Python version to use'
        required: false
        type: string
        default: '3.11'
      src-dirs:
        description: 'Space-separated source directories to include (e.g., "src run.py")'
        required: false
        type: string
        default: 'src run.py'

permissions:
  contents: write

jobs:
  build-mcpb:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: ${{ inputs.python-version }}

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Get version from tag
        id: version
        run: |
          if [ "${{ github.ref_type }}" = "tag" ]; then
            VERSION="${GITHUB_REF#refs/tags/v}"
          else
            VERSION=$(python3 -c "import tomllib; print(tomllib.load(open('pyproject.toml','rb'))['project']['version'])")
          fi
          echo "VERSION=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Install mcpb CLI
        run: npm install -g @anthropic-ai/mcpb

      - name: Create staging directory
        run: |
          mkdir -p staging

          # Copy source files/dirs
          for item in ${{ inputs.src-dirs }}; do
            if [ -e "$item" ]; then
              cp -r "$item" staging/
            fi
          done

          # Copy config files
          cp pyproject.toml staging/ 2>/dev/null || true
          cp manifest.json staging/

          # Copy data directory if it exists
          if [ -d "data" ]; then
            cp -r data staging/
          fi

          # Clean Python cache
          find staging -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
          find staging -name '*.pyc' -delete 2>/dev/null || true

      - name: Install Python dependencies into staging lib/
        run: |
          if [ -f "requirements.txt" ]; then
            pip install -r requirements.txt -t staging/lib --quiet
          elif [ -f "pyproject.toml" ]; then
            pip install . -t staging/lib --quiet --no-deps
            # Install runtime deps
            pip install mcp -t staging/lib --quiet
          fi

      - name: Update manifest version
        run: |
          node -e "
            const fs = require('fs');
            const m = JSON.parse(fs.readFileSync('staging/manifest.json', 'utf8'));
            m.version = '${{ steps.version.outputs.VERSION }}';
            fs.writeFileSync('staging/manifest.json', JSON.stringify(m, null, 2));
          "

      - name: Validate manifest
        run: mcpb validate staging/manifest.json

      - name: Pack MCPB bundle
        run: mcpb pack staging "${{ inputs.server-name }}.mcpb"

      - name: Show bundle info
        run: mcpb info "${{ inputs.server-name }}.mcpb"

      - name: Upload bundle artifact
        uses: actions/upload-artifact@v4
        with:
          name: mcpb-bundle
          path: ${{ inputs.server-name }}.mcpb

  release:
    needs: build-mcpb
    runs-on: ubuntu-latest
    if: github.ref_type == 'tag'
    permissions:
      contents: write

    steps:
      - name: Download bundle
        uses: actions/download-artifact@v4
        with:
          name: mcpb-bundle

      - name: Upload bundle to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: ${{ inputs.server-name }}.mcpb
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Summary
        run: |
          echo "## MCPB Bundle Uploaded" >> "$GITHUB_STEP_SUMMARY"
          echo "" >> "$GITHUB_STEP_SUMMARY"
          echo "| File | Version |" >> "$GITHUB_STEP_SUMMARY"
          echo "|------|---------|" >> "$GITHUB_STEP_SUMMARY"
          echo "| ${{ inputs.server-name }}.mcpb | ${{ needs.build-mcpb.outputs.version || 'from tag' }} |" >> "$GITHUB_STEP_SUMMARY"
```

**Step 2: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/mcp-server-template
git add .github/workflows/mcpb-bundle-python.yml
git commit -m "feat: add reusable Python .mcpb bundle workflow

Reusable workflow for all Ansvar Python MCP servers.
Installs Python deps into staging/lib, packs with mcpb CLI."
```

---

### Task 3: Add manifest.json template to mcp-server-template

**Files:**
- Create: `/Users/jeffreyvonrotz/Projects/mcp-server-template/manifest.json`

**Step 1: Create the template manifest**

```json
{
  "manifest_version": "0.3",
  "name": "your-mcp-server",
  "display_name": "Your MCP Server",
  "version": "0.1.0",
  "description": "Brief description of what this MCP server does.",
  "author": {
    "name": "Ansvar Systems",
    "email": "hello@ansvar.eu",
    "url": "https://ansvar.eu"
  },
  "license": "Apache-2.0",
  "repository": {
    "type": "git",
    "url": "https://github.com/Ansvar-Systems/your-mcp-server"
  },
  "homepage": "https://ansvar.eu",
  "keywords": [],
  "server": {
    "type": "node",
    "entry_point": "dist/index.js",
    "mcp_config": {
      "command": "node",
      "args": ["${__dirname}/dist/index.js"],
      "env": {}
    }
  },
  "tools": [],
  "compatibility": {
    "platforms": ["darwin", "win32", "linux"],
    "runtimes": {
      "node": ">=18.0.0"
    }
  }
}
```

**Step 2: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/mcp-server-template
git add manifest.json
git commit -m "feat: add manifest.json template for .mcpb bundling"
```

**Step 3: Push template repo**

```bash
cd /Users/jeffreyvonrotz/Projects/mcp-server-template
git push origin main
```

---

## Phase 2: Fix EU_compliance_MCP

### Task 4: Replace broken mcpb-bundle.yml with thin caller

**Files:**
- Modify: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP/.github/workflows/mcpb-bundle.yml`

**Step 1: Replace the entire workflow with the thin caller**

Replace the full contents of `.github/workflows/mcpb-bundle.yml` with:

```yaml
name: Build MCPB Bundle

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  bundle:
    uses: Ansvar-Systems/mcp-server-template/.github/workflows/mcpb-bundle-node.yml@main
    with:
      server-name: eu-regulations-mcp
    permissions:
      contents: write
```

**Step 2: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
git add .github/workflows/mcpb-bundle.yml
git commit -m "fix: replace broken .mcpb workflow with reusable workflow caller

Old workflow referenced better-sqlite3 (removed in bcddc17).
Now calls reusable workflow from mcp-server-template.
Single-platform build — no native deps with WASM SQLite."
```

---

### Task 5: Fix publish.yml — remove dead better-sqlite3 rebuild

**Files:**
- Modify: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP/.github/workflows/publish.yml`

**Step 1: Remove the stale better-sqlite3 rebuild step (lines 40-44)**

Remove this block:
```yaml
      - name: Rebuild native dependencies
        run: |
          cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3
          npm run install
```

**Step 2: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
git add .github/workflows/publish.yml
git commit -m "fix: remove dead better-sqlite3 rebuild from publish workflow

better-sqlite3 was replaced by @ansvar/mcp-sqlite (WASM) in bcddc17.
No native module rebuild needed."
```

---

### Task 6: Update server.json with correct version and stats

**Files:**
- Modify: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP/server.json`

**Step 1: Update server.json**

Update version from `0.7.1` to `1.0.0` and fix the description stats:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "eu.ansvar/eu-regulations-mcp",
  "description": "Query 49 EU regulations (GDPR, NIS2, DORA, AI Act, CRA) - 2,528 articles, 3,869 recitals, ISO 27001 & NIST CSF 2.0 mappings",
  "repository": {
    "url": "https://github.com/Ansvar-Systems/EU_compliance_MCP",
    "source": "github"
  },
  "homepage": "https://ansvar.eu",
  "version": "1.0.0",
  "license": "Apache-2.0",
  "keywords": [
    "compliance",
    "gdpr",
    "nis2",
    "dora",
    "ai-act",
    "cra",
    "cybersecurity",
    "eu-regulations",
    "iso27001",
    "nist"
  ],
  "packages": [
    {
      "registryType": "npm",
      "identifier": "@ansvar/eu-regulations-mcp",
      "version": "1.0.0",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```

**Step 2: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
git add server.json
git commit -m "fix: update server.json to v1.0.0 with correct regulation counts"
```

---

## Phase 3: ChatGPT Support

### Task 7: Add Vercel serverless API route for Streamable HTTP

**Files:**
- Create: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP/api/mcp.ts`
- Create: `/Users/jeffreyvonrotz/Projects/EU_compliance_MCP/vercel.json`

**Step 1: Create vercel.json**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": ".",
  "functions": {
    "api/mcp.ts": {
      "maxDuration": 30,
      "memory": 512
    }
  },
  "rewrites": [
    { "source": "/mcp", "destination": "/api/mcp" },
    { "source": "/health", "destination": "/api/health" }
  ]
}
```

**Step 2: Create the Vercel API route**

Create `api/mcp.ts` — a Vercel serverless function that wraps the MCP server with Streamable HTTP transport:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import Database from '@ansvar/mcp-sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { registerTools } from '../src/tools/registry.js';
import { createSqliteAdapter } from '../src/database/sqlite-adapter.js';
import type { DatabaseAdapter } from '../src/database/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, '..', 'data', 'regulations.db');

let db: DatabaseAdapter | null = null;

function getDatabase(): DatabaseAdapter {
  if (!db) {
    const sqliteDb = new Database(DB_PATH, { readonly: true });
    db = createSqliteAdapter(sqliteDb);
  }
  return db;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const database = getDatabase();

  const server = new Server(
    { name: 'eu-regulations-mcp', version: '1.0.0' },
    { capabilities: { tools: {} } }
  );

  registerTools(server, database);

  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // Stateless for serverless
  });

  await server.connect(transport);
  await transport.handleRequest(req, res);
}
```

**Step 3: Create health check route**

Create `api/health.ts`:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ status: 'ok', server: 'eu-regulations-mcp' });
}
```

**Step 4: Install Vercel types (dev dep)**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
npm install --save-dev @vercel/node
```

**Step 5: Commit**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
git add vercel.json api/mcp.ts api/health.ts package.json package-lock.json
git commit -m "feat: add Vercel serverless deployment for ChatGPT Streamable HTTP

Adds /mcp endpoint for ChatGPT Web and other remote MCP clients.
Stateless serverless function — each request creates a fresh MCP server.
Health check at /health."
```

---

### Task 8: Delete the pre-existing .mcpb bundle from the repo

The `.mcpb` file in the repo root (930KB binary) should not be committed — it's a build artifact.

**Step 1: Add to .gitignore**

Add `*.mcpb` to `.gitignore`.

**Step 2: Remove tracked file**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
git rm --cached eu-regulations-mcp.mcpb
```

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: remove .mcpb binary from repo, add to .gitignore

.mcpb bundles are build artifacts created by CI, not source files."
```

---

## Phase 4: Rollout to Other Node.js MCP Servers

### Task 9: Add manifest.json + caller workflow to all Node.js repos

For each of these repos, create two files:

**Repos:** STRIDE-mcp, GLEIF-mcp, Automotive-MCP, US_Compliance_MCP, Dutch-law-mcp, nordic-law-mcp, swedish-law-mcp, ot-security-mcp, client_context_mcp

**Per repo — Step 1: Create `.github/workflows/mcpb-bundle.yml`**

```yaml
name: Build MCPB Bundle

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  bundle:
    uses: Ansvar-Systems/mcp-server-template/.github/workflows/mcpb-bundle-node.yml@main
    with:
      server-name: <SERVER_NAME>
    permissions:
      contents: write
```

Where `<SERVER_NAME>` is:
| Repo | server-name |
|------|-------------|
| STRIDE-mcp | stride-patterns-mcp |
| GLEIF-mcp | gleif-mcp |
| Automotive-MCP | automotive-cybersecurity-mcp |
| US_Compliance_MCP | us-regulations-mcp |
| Dutch-law-mcp | dutch-law-mcp |
| nordic-law-mcp | nordic-law-mcp |
| swedish-law-mcp | swedish-law-mcp |
| ot-security-mcp | ot-security-mcp |
| client_context_mcp | client-context-mcp |

**Per repo — Step 2: Create `manifest.json`**

Copy the template from `mcp-server-template/manifest.json` and customize:
- `name`: npm package name (without @ansvar/ prefix)
- `display_name`: Human-readable name
- `description`: From package.json
- `repository.url`: Correct GitHub URL
- `tools`: List tools from the server's tool registry
- `keywords`: From package.json

**Per repo — Step 3: Commit and push**

```bash
git add .github/workflows/mcpb-bundle.yml manifest.json
git commit -m "feat: add automated .mcpb bundle creation on release"
git push origin main
```

---

### Task 10: Fix security-controls-mcp Python caller

**Files:**
- Modify: `/Users/jeffreyvonrotz/Projects/security-controls-mcp/.github/workflows/mcpb-bundle.yml`

**Step 1: Replace with thin caller**

```yaml
name: Build MCPB Bundle

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

jobs:
  bundle:
    uses: Ansvar-Systems/mcp-server-template/.github/workflows/mcpb-bundle-python.yml@main
    with:
      server-name: security-controls-mcp
      src-dirs: src run.py
    permissions:
      contents: write
```

**Step 2: Commit and push**

```bash
cd /Users/jeffreyvonrotz/Projects/security-controls-mcp
git add .github/workflows/mcpb-bundle.yml
git commit -m "fix: use reusable .mcpb workflow, remove broken platform matrix"
git push origin main
```

---

### Task 11: Add manifest.json + caller workflow to remaining Python repos

**Repos:** threat-intel-mcp, Document-Logic-MCP, TPRM-Frameworks-mcp

Same pattern as Task 10 — create `manifest.json` (with `server.type: "python"`) and the thin caller workflow.

Per repo, commit and push.

---

## Phase 5: Verify

### Task 12: Verify EU_compliance_MCP workflow with manual dispatch

**Step 1: Trigger workflow_dispatch**

```bash
cd /Users/jeffreyvonrotz/Projects/EU_compliance_MCP
gh workflow run "Build MCPB Bundle" --ref main
```

**Step 2: Watch the run**

```bash
gh run watch --exit-status
```

Expected: Single ubuntu job runs, produces `eu-regulations-mcp.mcpb`, uploads as artifact.

---

## Summary of All Changes

| Phase | Repo | Files Changed |
|-------|------|---------------|
| 1 | mcp-server-template | +mcpb-bundle-node.yml, +mcpb-bundle-python.yml, +manifest.json |
| 2 | EU_compliance_MCP | ~mcpb-bundle.yml, ~publish.yml, ~server.json |
| 3 | EU_compliance_MCP | +vercel.json, +api/mcp.ts, +api/health.ts, ~.gitignore |
| 4 | 9 Node.js repos | +mcpb-bundle.yml, +manifest.json (each) |
| 4 | security-controls-mcp | ~mcpb-bundle.yml |
| 4 | 3 Python repos | +mcpb-bundle.yml, +manifest.json (each) |
| 5 | EU_compliance_MCP | Verify via workflow_dispatch |
