# EU Regulations MCP - Package Structure

This is a monorepo containing multiple packages for the EU Regulations compliance system.

## Packages

### `@ansvar/eu-regulations-core`
Core business logic and database layer. Contains:
- Database connection management (PostgreSQL)
- Service layer (search, articles, definitions, mappings, etc.)
- Shared TypeScript types
- No protocol-specific code (can be used by MCP, REST, CLI, etc.)

### `@ansvar/eu-regulations-mcp-server`
MCP (Model Context Protocol) server implementation:
- Stdio transport (for Claude Desktop, Cursor, etc.)
- HTTP transport
- Imports core package for business logic

**Note:** This will be moved from `src/` after the v0.4.1 refactor is complete.

### `@ansvar/eu-regulations-api`
REST API server for Teams/Copilot integration:
- Express server with OpenAPI documentation
- Microsoft Entra ID (Azure AD) authentication
- Rate limiting and security middleware
- Teams-compatible message card formatting
- Imports core package for business logic

### `@ansvar/eu-regulations-teams`
Microsoft Teams message extension:
- Teams app manifest
- App icons and branding
- Deployment instructions
- Points to REST API endpoints

## Development

```bash
# Install all dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Development mode (with hot reload)
cd packages/rest-api
npm run dev
```

## Architecture Flow

```
User Request
    ↓
┌───────────────────────────┐
│  Interface Layer          │
│  - MCP Server (stdio/HTTP)│
│  - REST API (Teams)       │
│  - CLI (future)           │
└───────────┬───────────────┘
            ↓
┌───────────────────────────┐
│  Core Package             │
│  - Services               │
│  - Database Layer         │
│  - Business Logic         │
└───────────┬───────────────┘
            ↓
┌───────────────────────────┐
│  PostgreSQL Database      │
│  - Regulations            │
│  - Articles, Recitals     │
│  - Definitions, Mappings  │
└───────────────────────────┘
```

## Migration Status

- ✅ Monorepo structure created
- ⏳ Core package (waiting for v0.4.1 registry.ts to be ready)
- ⏳ REST API package
- ⏳ Teams extension
- ⏳ PostgreSQL migration

Once the v0.4.1 refactor creates `src/tools/registry.ts`, we'll lift that into `packages/core/` and complete the migration.
