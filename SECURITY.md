# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.8.x   | :white_check_mark: |
| < 0.8   | :x:                |

We support only the latest minor version. Please upgrade to receive security patches.

## Security Scanning

This project uses multiple layers of automated security scanning:

### Dependency Vulnerabilities
- **Dependabot**: Automated dependency updates (weekly)
- **npm audit**: Runs on every CI build
- **Socket.dev**: Supply chain attack detection

### Code Analysis
- **CodeQL**: Static analysis for security vulnerabilities (weekly + on PRs)
- **Custom security tests**: SQL injection, XSS, ReDoS prevention (135 tests)

### What We Scan For
- Known CVEs in dependencies
- SQL injection vulnerabilities
- Cross-site scripting (XSS)
- Regular expression denial of service (ReDoS)
- Path traversal attacks
- Supply chain attacks (malicious packages, typosquatting)
- Integer overflow/underflow
- Unsafe deserialization

## Reporting a Vulnerability

If you discover a security vulnerability:

1. **Do NOT open a public GitHub issue**
2. Email: hello@ansvar.eu
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if you have one)

We will respond within 48 hours and provide a timeline for a fix.

## Security Best Practices

This project follows security best practices:

- ✅ All database queries use prepared statements (no SQL injection)
- ✅ Input validation on all user-provided data
- ✅ Read-only database access (no write operations)
- ✅ No execution of user-provided code
- ✅ Automated security testing in CI/CD
- ✅ Regular dependency updates via Dependabot
- ✅ Pre-push hooks block broken tests locally

## Database Security

### Regulation Database (SQLite)

The regulation database (`data/regulations.db`) is:
- Pre-built and version-controlled (tamper evident)
- Opened in read-only mode (no write risk)
- Source data from official EUR-Lex (auditable)
- Ingestion scripts require manual execution (no auto-download)

### PostgreSQL Connections (Optional)

For deployments using PostgreSQL (Cloudflare Workers, REST API):

- ✅ **TLS/SSL enabled by default** in production
- ✅ **Certificate validation** enforced for managed providers
- ✅ **Custom CA support** for self-hosted deployments
- ✅ **Secure-by-default** configuration with explicit opt-out

**Configuration**: See [docs/DATABASE_SSL.md](docs/DATABASE_SSL.md) for detailed SSL/TLS setup guide.

**Environment Variables**:
```bash
# Secure (default in production)
DATABASE_URL=postgresql://...
DATABASE_SSL_MODE=require  # or omit, auto-enabled in production

# Self-hosted with custom CA
DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/path/to/ca.crt

# Local dev only (no SSL)
DATABASE_SSL_MODE=disable
```

**Never use in production**: `DATABASE_SSL_MODE=disable` or `rejectUnauthorized: false`

## Third-Party Dependencies

We minimize dependencies and regularly audit:
- Core runtime: Node.js, TypeScript, better-sqlite3
- MCP SDK: Official Anthropic package
- No unnecessary dependencies

All dependencies are tracked via `package-lock.json` and scanned for vulnerabilities.

## Security Audit Results

**Latest Audit**: 2026-02-07

- **npm dependencies**: 2 false positives (verified safe via `npm ls`)
- **Code scanning**: 1 real issue (TLS bypass) - **FIXED** in commit 199c94b
- **OSSF Scorecard**: 29 best-practice recommendations (not vulnerabilities)

See [GitHub Security Tab](https://github.com/Ansvar-Systems/EU_compliance_MCP/security) for live results.

---

**Last Updated**: 2026-02-07
