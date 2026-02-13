# Automated .mcpb Bundling + ChatGPT Support for All Ansvar MCP Servers

**Date:** 2026-02-13
**Status:** Approved

## Problem

1. Only 2 of 15+ MCP servers have `.mcpb` workflows, and both are broken (reference `better-sqlite3` which was replaced by `@ansvar/mcp-sqlite` WASM)
2. The multi-platform matrix build (darwin/win32/linux) is unnecessary since there are no native dependencies
3. ChatGPT now supports MCP servers (Desktop via stdio, Web via Streamable HTTP) but no Ansvar servers are configured for it

## Solution: Reusable Workflows + ChatGPT Integration

### Reusable Workflows in `mcp-server-template`

Two workflows covering the full suite:

**`mcpb-bundle-node.yml`** (10 Node.js servers):
- Single ubuntu build (no platform matrix needed)
- Inputs: `server-name`
- Steps: checkout, build, stage, pack .mcpb, upload to GitHub Release

**`mcpb-bundle-python.yml`** (5 Python servers):
- Single ubuntu build
- Inputs: `server-name`
- Steps: checkout, stage with pip deps, pack .mcpb, upload to GitHub Release

### Caller Workflow (per repo)

Each MCP server repo adds a thin caller:
```yaml
name: Build MCPB Bundle
on:
  push:
    tags: ['v*']
  workflow_dispatch:
jobs:
  bundle:
    uses: Ansvar-Systems/mcp-server-template/.github/workflows/mcpb-bundle-node.yml@main
    with:
      server-name: <server-name>
    permissions:
      contents: write
```

### EU_compliance_MCP Fixes

1. Replace broken `mcpb-bundle.yml` with thin caller
2. Remove dead `better-sqlite3` rebuild from `publish.yml`
3. Update `server.json` version and stats

### ChatGPT Support

**Tier 1 - Desktop (all servers):** ChatGPT Desktop Developer Mode config in README:
```json
{
  "mcpServers": {
    "eu-regulations": {
      "command": "npx",
      "args": ["-y", "@ansvar/eu-regulations-mcp"]
    }
  }
}
```

**Tier 2 - Vercel hosted (EU_compliance_MCP):**
- `vercel.json` + serverless API route adapter for Streamable HTTP
- ChatGPT Web can connect via URL

## Server Inventory

| Repo | Language | Has .mcpb? | Action |
|------|----------|------------|--------|
| mcp-server-template | Node | No | Add reusable workflows + manifest template |
| EU_compliance_MCP | Node | Broken | Fix caller, fix publish.yml, add Vercel |
| security-controls-mcp | Python | Broken | Fix caller |
| STRIDE-mcp | Node | No | Add manifest + caller |
| GLEIF-mcp | Node | No | Add manifest + caller |
| Automotive-MCP | Node | No | Add manifest + caller |
| US_Compliance_MCP | Node | No | Add manifest + caller |
| Dutch-law-mcp | Node | No | Add manifest + caller |
| nordic-law-mcp | Node | No | Add manifest + caller |
| swedish-law-mcp | Node | No | Add manifest + caller |
| ot-security-mcp | Node | No | Add manifest + caller |
| client_context_mcp | Node | No | Add manifest + caller |
| threat-intel-mcp | Python | No | Add manifest + caller |
| Document-Logic-MCP | Python | No | Add manifest + caller |
| Vendor_Intelligence_MCP | Python | No | Add manifest + caller |
| TPRM-Frameworks-mcp | Python | No | Add manifest + caller |

## Key Design Decisions

- **No platform matrix**: WASM SQLite + pure Python = universal bundles
- **Reusable workflows over composite actions**: Simpler, native GitHub feature
- **ChatGPT Desktop = same config as Claude Desktop**: No new files needed, just docs
- **Vercel for remote hosting**: Already in user's toolchain, good enough at scale, Cloudflare Workers available for extreme scale
