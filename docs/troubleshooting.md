# Troubleshooting

## Database Not Found Error

If you see `Failed to open database at .../data/regulations.db`:

The database is built automatically during installation via the `postinstall` script. If it's missing:

```bash
# Rebuild the database
npm run build:db

# Or if installed globally/via npx, reinstall
npm install -g @ansvar/eu-regulations-mcp --force
```

The database contains all 37 regulations (~15MB). It's gitignored in the source repo but built during:
- `npm install` (postinstall hook)
- `npm publish` (prepublishOnly hook)

---

## MCP Server Not Starting

Check that you're using Node.js 18 or higher:

```bash
node --version  # Should be v18.0.0 or higher
```

---

## Slow First Query

The first query after startup may be slow (~1-2s) as SQLite loads the database into memory. Subsequent queries are fast (<50ms).
