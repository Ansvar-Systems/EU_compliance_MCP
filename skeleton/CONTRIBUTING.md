# Contributing Guide

Thank you for your interest in contributing to this MCP server!

## Getting Started

### Prerequisites

- Node.js 18+
- npm 9+
- Git

### Development Setup

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/YOUR_USERNAME/your-mcp-server.git
   cd your-mcp-server
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Run tests**

   ```bash
   npm test
   ```

## Development Workflow

### Making Changes

1. Create a branch for your changes:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. Make your changes

3. Run tests:
   ```bash
   npm test
   ```

4. Build to check for TypeScript errors:
   ```bash
   npm run build
   ```

5. Commit your changes:
   ```bash
   git commit -m "Description of changes"
   ```

6. Push and create a pull request

### Testing with MCP Inspector

To test your changes interactively:

```bash
npx @anthropic/mcp-inspector node dist/index.js
```

This opens a web UI where you can call tools and see responses.

## Code Style

### TypeScript

- Use TypeScript strict mode
- Define interfaces for all function inputs/outputs
- Use async/await for all database operations
- Use `null` for "not found", throw for invalid input

### Naming

- Files: `kebab-case.ts`
- Interfaces: `PascalCase`
- Functions: `camelCase`
- MCP tools: `snake_case`
- Database tables/columns: `snake_case`

### Documentation

- Add JSDoc comments to all exported functions
- Include `@param` and `@returns` tags
- Add usage examples in comments

## Adding a New Tool

1. Create a new file in `src/tools/`:
   ```typescript
   // src/tools/my-tool.ts
   export interface MyToolInput { ... }
   export interface MyToolResult { ... }
   export async function myTool(db: Database, input: MyToolInput): Promise<MyToolResult> { ... }
   ```

2. Add tests in `tests/tools/my-tool.test.ts`

3. Register the tool in `src/index.ts`:
   - Add to `TOOLS` array
   - Add case in `CallToolRequestSchema` handler

4. Update README.md with tool documentation

## Adding New Data

### Adding a New Source

1. Create a seed file in `data/seed/`:
   ```json
   {
     "id": "SOURCE_ID",
     "full_name": "Full Name",
     "items": [ ... ],
     "definitions": [ ... ]
   }
   ```

2. Rebuild the database:
   ```bash
   npm run build:db
   ```

3. Add tests for the new data

4. Update COVERAGE.md

### Updating Existing Data

1. Run the ingestion script:
   ```bash
   npm run ingest -- <identifier> data/seed/source.json
   ```

2. Rebuild the database:
   ```bash
   npm run build:db
   ```

3. Run tests to verify nothing broke:
   ```bash
   npm test
   ```

## Pull Request Guidelines

### Before Submitting

- [ ] Tests pass (`npm test`)
- [ ] Build succeeds (`npm run build`)
- [ ] No TypeScript errors
- [ ] Documentation updated if needed

### PR Description

Include:
- What changes were made
- Why the changes were needed
- How to test the changes

### Review Process

1. Automated checks must pass
2. At least one maintainer review required
3. Address feedback promptly

## Reporting Issues

### Bug Reports

Include:
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (Node version, OS)

### Feature Requests

Include:
- Use case description
- Proposed solution (if any)
- Alternatives considered

## Questions?

Open a discussion on GitHub or reach out to the maintainers.

---

Thank you for contributing!
