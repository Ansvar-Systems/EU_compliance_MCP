# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5   | :x:                |

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
2. Email: hello@ansvar.ai
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

The regulation database (`data/regulations.db`) is:
- Pre-built and version-controlled (tamper evident)
- Opened in read-only mode (no write risk)
- Source data from official EUR-Lex (auditable)
- Ingestion scripts require manual execution (no auto-download)

## Third-Party Dependencies

We minimize dependencies and regularly audit:
- Core runtime: Node.js, TypeScript, better-sqlite3
- MCP SDK: Official Anthropic package
- No unnecessary dependencies

All dependencies are tracked via `package-lock.json` and scanned for vulnerabilities.

---

**Last Updated**: 2026-01-28
