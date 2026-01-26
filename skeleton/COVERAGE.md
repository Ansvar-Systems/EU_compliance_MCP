# Data Coverage

> Detailed information about the data included in this MCP server

## Overview

| Metric | Value |
|--------|-------|
| Total Sources | [X] |
| Total Items | [X] |
| Total Definitions | [X] |
| Last Updated | [Date] |

---

## Sources

### [Source 1 Name]

| Field | Value |
|-------|-------|
| ID | `SOURCE_A` |
| Full Name | [Full official name] |
| Official Identifier | [e.g., CELEX, SFS number] |
| Effective Date | [Date] |
| Items | [X] |
| Definitions | [X] |
| Official URL | [Link] |
| Local Version | [Version/Date from source_registry] |

**Notes:**
- [Any important notes about this source]
- [Known limitations or gaps]

---

### [Source 2 Name]

| Field | Value |
|-------|-------|
| ID | `SOURCE_B` |
| Full Name | [Full official name] |
| Official Identifier | [e.g., CELEX, SFS number] |
| Effective Date | [Date] |
| Items | [X] |
| Definitions | [X] |
| Official URL | [Link] |
| Local Version | [Version/Date from source_registry] |

**Notes:**
- [Any important notes about this source]

---

## Data Quality

### Completeness

| Source | Expected Items | Parsed Items | Status |
|--------|----------------|--------------|--------|
| SOURCE_A | [X] | [X] | ✅ Complete |
| SOURCE_B | [X] | [X] | ✅ Complete |

### Known Limitations

- [List any known gaps or limitations]
- [Items that couldn't be parsed]
- [Sections intentionally excluded]

---

## Update Schedule

| Source | Update Frequency | Last Checked |
|--------|------------------|--------------|
| SOURCE_A | [e.g., When amended] | [Date] |
| SOURCE_B | [e.g., Monthly] | [Date] |

To check for updates:
```bash
npm run check-updates
```

---

## Version History

### v0.1.0 (YYYY-MM-DD)

- Initial release
- Included: [List sources]

---

## Adding New Sources

See [CONTRIBUTING.md](CONTRIBUTING.md) for instructions on adding new sources.

Required information:
1. Official source URL
2. Identifier format (CELEX, SFS, etc.)
3. Expected item count
4. Known parsing challenges
