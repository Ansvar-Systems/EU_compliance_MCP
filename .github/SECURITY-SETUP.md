# GitHub Actions Security Setup

This document provides internal guidance for configuring GitHub Actions secrets and security features for the EU Compliance MCP project.

## Required Secrets

### NPM Publishing (`publish.yml`)

| Secret | Purpose | How to Obtain |
|--------|---------|---------------|
| `NPM_TOKEN` | Publish packages to npm with provenance attestation | 1. Log in to [npmjs.com](https://www.npmjs.com/)<br>2. Go to Access Tokens → Generate New Token<br>3. Select "Automation" type<br>4. Copy token and add to GitHub secrets |

**Scope:** Must have publish permissions for `@ansvar-systems/eu-compliance-mcp`

### MCP Registry Publishing (`publish.yml`)

| Secret | Purpose | How to Obtain |
|--------|---------|---------------|
| `AZURE_CREDENTIALS` | Access Azure Key Vault for MCP publisher signing key | Shared credential in Azure portal<br>Used to authenticate with Key Vault `kv-ansvar-dev` |

**Key Vault Secret:** `mcp-publisher-private-key` (shared across all Ansvar MCP projects)

**Note:** The MCP publisher private key is stored in Azure Key Vault and shared across all Ansvar MCP servers (US Compliance, EU Compliance, OT Security, Sanctions, Automotive). This ensures consistent package signing.

### Optional: Notification Webhooks (`check-updates.yml`)

| Secret | Purpose | Required |
|--------|---------|----------|
| `SLACK_WEBHOOK_URL` | Send EUR-Lex update notifications to Slack | Optional |
| `DISCORD_WEBHOOK_URL` | Send EUR-Lex update notifications to Discord | Optional |
| `DISCORD_MENTION_ROLE_ID` | Role ID to mention in Discord notifications | Optional |
| `GENERIC_WEBHOOK_URL` | Send notifications to custom endpoint | Optional |

**Behavior:** The update checker workflow uses `continue-on-error: true` for webhook notifications. If secrets are not configured, webhook steps are skipped and the workflow continues normally, creating GitHub issues as the primary notification method.

## Automatic Secrets

These are provided by GitHub Actions automatically:

| Secret | Purpose | Scope |
|--------|---------|-------|
| `GITHUB_TOKEN` | Create/update issues, push tags | Automatic, scoped to repository |

**Permissions:** Workflows use principle of least privilege via explicit `permissions:` blocks.

## Security Configuration

### Branch Protection Rules

**Main branch protection:**
- ✅ Require status checks to pass before merging
- ✅ Require branches to be up to date before merging
- ✅ Required checks: `test`, `security`, `type-check`, `build-verification`
- ✅ Require review from code owner

### GitHub Security Features

**Enable in Settings → Security:**
- ✅ Dependabot alerts
- ✅ Dependabot security updates
- ✅ Secret scanning
- ✅ Code scanning (via CodeQL workflow)

### Workflow Permissions

**Settings → Actions → General → Workflow permissions:**
- ✅ Read repository contents and packages
- ✅ Allow GitHub Actions to create and approve pull requests (for auto-update)

## Secret Management Best Practices

### Secret Rotation

| Secret | Rotation Schedule | Owner |
|--------|-------------------|-------|
| `NPM_TOKEN` | Every 90 days | DevOps Team |
| `AZURE_CREDENTIALS` | Annual | Security Team |
| `*_WEBHOOK_URL` | As needed | Engineering Team |

**Rotation Process:**
1. Generate new credential in source system
2. Update GitHub secret via Settings → Secrets → Actions
3. Test with workflow dispatch
4. Revoke old credential
5. Document rotation in team log

### Secret Security

**DO:**
- ✅ Use Azure Key Vault for shared secrets (MCP publisher key)
- ✅ Limit secret scope to minimum required repositories
- ✅ Use `::add-mask::` in workflows when logging values that might contain secrets
- ✅ Rotate secrets on schedule and after any suspected compromise
- ✅ Use different tokens for different environments (dev/prod)

**DON'T:**
- ❌ Store secrets directly in workflow files (always use `${{ secrets.SECRET_NAME }}`)
- ❌ Use personal access tokens for production workflows
- ❌ Share secrets across unrelated projects
- ❌ Log secrets in workflow output (even masked values can leak via timing attacks)
- ❌ Commit secrets to repository (use Gitleaks to detect)

### Azure Key Vault Configuration

**Key Vault:** `kv-ansvar-dev`
**Region:** West Europe
**Resource Group:** `rg-ansvar-dev`

**Access Pattern:**
```yaml
- name: Azure Login
  uses: azure/login@v1
  with:
    creds: ${{ secrets.AZURE_CREDENTIALS }}

- name: Get Secret from Key Vault
  run: |
    SECRET=$(az keyvault secret show \
      --vault-name kv-ansvar-dev \
      --name mcp-publisher-private-key \
      --query value -o tsv)
    echo "::add-mask::$SECRET"
```

**Shared Secrets in Key Vault:**
- `mcp-publisher-private-key` - Used by all Ansvar MCP servers for package signing

## Workflow Security Features

### Permission Scoping

All workflows use explicit minimal permissions:

```yaml
permissions:
  contents: read              # Read code
  security-events: write      # Upload SARIF (security workflows only)
  id-token: write            # OIDC publishing (publish workflow only)
```

**Never use:** `permissions: write-all` or `contents: write` unless absolutely necessary.

### SARIF Upload

Security scanning tools upload results to GitHub Security tab:

```yaml
- name: Upload SARIF
  uses: github/codeql-action/upload-sarif@v3
  with:
    sarif_file: results.sarif
```

**Access:** Security → Code scanning alerts

### Provenance Attestation

npm packages are published with cryptographic signing:

```bash
npm publish --access public --provenance
```

**Verification:**
```bash
npm audit signatures
```

This creates a publicly verifiable link between the npm package and the GitHub Actions workflow that built it.

## Troubleshooting

### Publishing Failures

**Symptom:** `publish.yml` fails with authentication error

**Checks:**
1. Verify `NPM_TOKEN` is set and valid (check token expiration)
2. Verify token has publish scope for `@ansvar-systems` organization
3. Check npm package version is unique (not already published)
4. Verify Azure credentials for Key Vault access

### SARIF Upload Failures

**Symptom:** Security scanning succeeds but SARIF upload fails

**Checks:**
1. Verify `security-events: write` permission in workflow
2. Check SARIF file was generated (e.g., `cat results.sarif`)
3. Verify SARIF format is valid (use `sarif-tools validate`)
4. Check GitHub Code Scanning is enabled in repository settings

### Update Monitoring Issues

**Symptom:** `check-updates.yml` fails to create issues

**Checks:**
1. Verify `GITHUB_TOKEN` has `issues: write` permission
2. Check EUR-Lex API accessibility (may be region-restricted)
3. Verify database file exists at `data/regulations.db`
4. Check workflow concurrency limits (GitHub Actions quotas)

## Emergency Procedures

### Compromised Secret

1. **Immediate:** Revoke secret in source system (npm, Azure, etc.)
2. **Immediate:** Rotate secret in GitHub settings
3. **Within 1 hour:** Audit workflow runs for unauthorized usage
4. **Within 24 hours:** Document incident and update team
5. **Within 48 hours:** Review and update secret rotation schedule

### Failed Security Scan

1. **High/Critical vulnerabilities:** Block merging until resolved
2. **Medium vulnerabilities:** Create issue, fix in next sprint
3. **Low/Info:** Track but don't block

**Exception Process:** Security team lead can approve merge with written justification and remediation plan.

## Contact

**Technical Issues:** DevOps Team (#engineering Slack)
**Security Concerns:** Security Team (security@ansvar.eu)
**Access Requests:** Infrastructure Team (infra@ansvar.eu)

## References

- [GitHub Actions Security Hardening](https://docs.github.com/en/actions/security-guides)
- [npm Provenance](https://docs.npmjs.com/generating-provenance-statements)
- [SARIF Format](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [Azure Key Vault](https://docs.microsoft.com/en-us/azure/key-vault/)
- [OpenSSF Scorecard](https://github.com/ossf/scorecard)

---

**Last Updated:** 2026-01-30
**Owner:** DevOps Team
**Review Schedule:** Quarterly
