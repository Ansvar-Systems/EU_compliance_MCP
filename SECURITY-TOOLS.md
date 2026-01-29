# Security Tools & Scanning

This repository uses multiple free security tools to protect against vulnerabilities, secrets, and security misconfigurations.

## 🛡️ Active Security Tools

### 1. **Gitleaks** - Secret Scanning
**Status:** ✅ Active (Pre-commit + CI)  
**Scans:** Passwords, API keys, tokens in code  
**Config:** `.gitleaks.toml`  
**Workflows:** `.github/workflows/gitleaks.yml`

**Coverage:**
- Pre-commit hook (blocks commits)
- GitHub Actions (scans PRs)
- 161 commits verified clean

### 2. **Dependabot** - Dependency Updates
**Status:** ✅ Active  
**Scans:** Vulnerable npm packages, GitHub Actions  
**Config:** `.github/dependabot.yml`  

**Features:**
- Automated security PRs
- Weekly scans (Mondays 6 AM UTC)
- Groups minor/patch updates
- Monitors: npm, GitHub Actions, Docker

### 3. **Trivy** - Vulnerability Scanner
**Status:** ✅ Active  
**Scans:** Dependencies, filesystem, config files  
**Workflow:** `.github/workflows/trivy.yml`

**Coverage:**
- npm dependency vulnerabilities
- Configuration misconfigurations
- Daily scans (3 AM UTC)
- SARIF upload to GitHub Security

### 4. **Semgrep** - SAST (Static Analysis)
**Status:** ✅ Active  
**Scans:** Code vulnerabilities, OWASP Top 10  
**Workflow:** `.github/workflows/semgrep.yml`

**Rules:**
- `p/security-audit` - General security
- `p/secrets` - Hardcoded secrets
- `p/owasp-top-ten` - OWASP vulnerabilities
- `p/javascript` - JS-specific issues
- `p/typescript` - TS-specific issues

### 5. **CodeQL** - Advanced SAST
**Status:** ✅ Active (Pre-existing)  
**Scans:** Complex security patterns  
**Workflow:** `.github/workflows/codeql.yml`

**Coverage:**
- JavaScript/TypeScript analysis
- SQL injection detection
- XSS vulnerability detection
- Data flow analysis

### 6. **Socket Security** - Supply Chain
**Status:** ✅ Active (Pre-existing)  
**Scans:** npm package security, typosquatting  
**Workflow:** `.github/workflows/socket-security.yml`

**Protection:**
- Malicious packages
- Dependency confusion
- Typosquatting attacks
- Install scripts

### 7. **OSSF Scorecard** - Best Practices
**Status:** ✅ Active  
**Scans:** Security best practices compliance  
**Workflow:** `.github/workflows/ossf-scorecard.yml`

**Checks:**
- Branch protection
- CI/CD security
- Dependency pinning
- Signed releases
- Weekly scans (Mondays 2 AM UTC)

### 8. **npm audit** - Package Vulnerabilities
**Status:** ✅ Active (in test.yml)  
**Scans:** Known npm vulnerabilities  
**Workflow:** `.github/workflows/test.yml`

**Features:**
- Runs on every test
- High severity threshold
- Continues on moderate issues

## 📊 Security Coverage Matrix

| Category | Tool(s) | Frequency | Blocking |
|----------|---------|-----------|----------|
| Secrets | Gitleaks | Every commit + PR | ✅ Yes |
| Dependencies | Dependabot, Trivy, npm audit | Weekly + Daily | ⚠️ Advisory |
| Code Quality | Semgrep, CodeQL | Every push | ⚠️ Advisory |
| Supply Chain | Socket Security | Every PR | ✅ Yes |
| Best Practices | OSSF Scorecard | Weekly | ℹ️ Report |
| Misconfig | Trivy | Daily | ⚠️ Advisory |

## 🔍 How to Run Locally

### Gitleaks (Secrets)
```bash
gitleaks detect --config .gitleaks.toml --verbose
```

### npm audit (Dependencies)
```bash
pnpm audit --audit-level=high
```

### Semgrep (SAST)
```bash
# Install
brew install semgrep

# Scan
semgrep scan --config=auto
```

### Trivy (Vulnerabilities)
```bash
# Install
brew install trivy

# Scan filesystem
trivy fs .

# Scan dependencies only
trivy fs --scanners vuln .
```

## 📈 GitHub Security Dashboard

All results are uploaded to **GitHub Security** → **Code scanning**:

- Navigate to: Repository → Security → Code scanning
- View alerts from: CodeQL, Semgrep, Trivy, Gitleaks, OSSF Scorecard
- Filter by severity: Critical, High, Medium, Low
- Track remediation status

## 🚨 Alert Handling

### Critical/High Severity
1. Automated PR created (if Dependabot)
2. GitHub Security alert created
3. Review and fix immediately
4. Verify fix with local scan

### Medium Severity
1. Review during regular maintenance
2. Update dependencies weekly
3. Monitor for exploits

### Low/Informational
1. Review quarterly
2. Bundle with other updates
3. No immediate action required

## 🔒 Pre-Commit Hooks

Active pre-commit checks:
- ✅ Gitleaks secret scanning (~25ms)
- ✅ Vitest test suite (~8s)

**To bypass** (not recommended):
```bash
git commit --no-verify
```

## 📋 Scheduled Scans

| Tool | Schedule | Day | Time (UTC) |
|------|----------|-----|------------|
| Dependabot | Weekly | Monday | 06:00 |
| OSSF Scorecard | Weekly | Monday | 02:00 |
| Trivy | Daily | Every day | 03:00 |
| npm audit | Every test | - | - |
| Gitleaks | Every commit | - | - |
| Semgrep | Every push | - | - |

## 🎯 Compliance Coverage

This security stack provides coverage for:

- ✅ **OWASP Top 10** (Semgrep, CodeQL)
- ✅ **CIS Benchmarks** (OSSF Scorecard)
- ✅ **NIST 800-53** (Multiple tools)
- ✅ **GDPR** (Secret scanning, data protection)
- ✅ **SOC 2** (Audit trails, monitoring)

## 📝 Adding New Tools

To add a new security tool:

1. Create workflow in `.github/workflows/`
2. Add to this documentation
3. Test locally first
4. Enable SARIF upload if supported
5. Update security matrix above

## 🆘 False Positives

### Gitleaks
Add to `.gitleaks.toml`:
```toml
[allowlist]
regexes = ['''your-false-positive-pattern''']
```

### Semgrep
Add comment above code:
```typescript
// nosemgrep: rule-id
```

### Trivy
Create `.trivyignore`:
```
CVE-2024-XXXXX  # Reason for ignoring
```

## 📊 Current Status

Last full security audit: **2026-01-29**

| Tool | Status | Last Run | Issues |
|------|--------|----------|--------|
| Gitleaks | ✅ Clean | 2026-01-29 | 0 |
| Dependabot | ✅ Active | Weekly | 0 |
| Trivy | ✅ Active | Daily | TBD |
| Semgrep | ✅ Active | Every push | TBD |
| CodeQL | ✅ Active | Every push | 0 |
| Socket | ✅ Active | Every PR | 0 |
| OSSF | ✅ Active | Weekly | TBD |

**Next Review:** Automatic (see schedule above)

---

**Maintained by:** Ansvar Systems Security Team  
**Contact:** security@ansvar.eu  
**Last Updated:** 2026-01-29
