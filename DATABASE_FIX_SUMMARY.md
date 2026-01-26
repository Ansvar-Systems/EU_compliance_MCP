# Database Path Resolution Fix

## Problem

The MCP server failed when installed via npm/npx with error:
```
Failed to open database at /Users/.../.npm/_npx/.../data/regulations.db:
SqliteError: unable to open database file
```

## Root Cause

The `regulations.db` file (12MB, generated from seed data) was:
1. **Gitignored** (correct - it's a build artifact)
2. **Not included in npm package** (incorrect - needed at runtime)
3. **Not built during postinstall** (missing)

When users installed via npm/npx, they got:
- ✅ Source files (`src/`, `dist/`)
- ✅ Seed data (`data/seed/*.json`)
- ❌ Built database (`data/regulations.db`)

## Solution

### 1. Enhanced `postinstall` Script

**Before:**
```json
"postinstall": "test -f dist/index.js || npm run build"
```

**After:**
```json
"postinstall": "(test -f dist/index.js || npm run build) && (test -f data/regulations.db || npm run build:db)"
```

Now builds both TypeScript AND database on install if missing.

### 2. Added `prepublishOnly` Script

```json
"prepublishOnly": "npm run build && npm run build:db"
```

Ensures database is built before `npm publish`, so it's included in the package tarball.

### 3. Created `.npmignore`

Prevents `.gitignore` from affecting npm packaging. The database file will now be included in published packages.

### 4. Added Database Integrity Tests

Created `tests/database.test.ts` to catch this issue in CI:
- Verifies database file exists
- Checks table counts (37 regulations, 2,278 articles)
- Validates FTS5 search index
- Tests control mappings and applicability rules

## How It Works Now

### Development Install
```bash
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP
cd eu-regulations-mcp
npm install  # Builds TypeScript + database
```

### NPM Install
```bash
npm install -g @ansvar/eu-regulations-mcp
# postinstall: Checks for database, builds if missing
```

### NPX (First Run)
```bash
npx @ansvar/eu-regulations-mcp
# Downloads package → runs postinstall → builds database → starts server
```

## Verification

Test the fix:
```bash
# Remove database to simulate fresh install
rm -f data/regulations.db

# Run postinstall
npm run postinstall

# Verify database was created
test -f data/regulations.db && echo "✓ Database exists"

# Check contents
sqlite3 data/regulations.db "SELECT COUNT(*) FROM regulations;"
# Should output: 37

# Run tests
npm test
```

## Prevention

The new test suite (`tests/database.test.ts`) will fail in CI if:
- Database file is missing
- Database has wrong table structure
- Article/regulation counts are incorrect
- FTS5 index is broken

## Files Changed

1. `package.json` - Updated postinstall, added prepublishOnly
2. `.npmignore` - Created to override .gitignore for npm
3. `README.md` - Added troubleshooting section
4. `tests/database.test.ts` - Created database integrity tests

## Technical Notes

### Why Not Include Database in Git?

The database is a 12MB build artifact generated from:
- 37 JSON files in `data/seed/`
- Applicability rules in `data/seed/applicability/`
- Control mappings in `data/seed/mappings/`

Including it in git would:
- Bloat the repository
- Create merge conflicts
- Make updates harder to review

### Why Build During postinstall?

Building during postinstall ensures:
- Package tarball stays small (~2MB vs ~14MB)
- Users always get freshest seed data
- Works in CI/CD environments
- No manual build step required

### Alternative Approaches Considered

1. **Include DB in npm package** - Rejected (14MB tarball)
2. **Download from CDN** - Rejected (adds external dependency)
3. **Lazy build on first query** - Rejected (slow first request)
4. **Current: Build during postinstall** - ✅ Best balance

## Impact

- ✅ Users can now install and use via npm/npx
- ✅ No manual build steps required
- ✅ Package size remains small
- ✅ CI/CD pipelines work out of the box
- ✅ Tests prevent regression
