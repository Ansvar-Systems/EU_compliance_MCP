# Socket.dev Setup Guide

## Why Socket.dev for a Compliance Tool

For a project that helps others with **EU compliance**, security credibility is critical. Socket.dev provides:

1. **Supply chain attack detection** - Catches malicious npm packages
2. **Typosquatting protection** - Detects `lodash` vs `lodahs` attacks
3. **Hidden malware scanning** - Finds backdoors in dependencies
4. **Industry standard badge** - Shows security diligence

**Time:** 5 minutes
**Cost:** Free for open source

---

## Setup Instructions

### Step 1: Create Account (2 minutes)

1. Go to https://socket.dev
2. Click **"Sign in with GitHub"**
3. Authorize Socket.dev to access your public repos

### Step 2: Install GitHub App (2 minutes)

1. After sign-in, go to **"Install GitHub App"**
2. Select **"Ansvar-Systems"** organization (or personal account)
3. Choose **"Only select repositories"**
4. Select: `EU_compliance_MCP`
5. Click **"Install"**

### Step 3: Verify Integration (1 minute)

1. Go to https://socket.dev/dashboard
2. You should see `Ansvar-Systems/EU_compliance_MCP` listed
3. Socket.dev will automatically scan your repo

### Step 4: Check GitHub Actions

1. Go to https://github.com/Ansvar-Systems/EU_compliance_MCP/actions
2. Find the **"Socket Security"** workflow
3. Should now show ✅ instead of ❌

---

## What Socket.dev Will Do

**On Every PR:**
- Comments with security analysis
- Blocks PRs with high-severity supply chain issues
- Shows dependency risk scores

**Weekly Scans:**
- Monitors for newly discovered threats
- Alerts on suspicious package behavior

**Examples it catches:**
- `event-stream` incident (Bitcoin wallet stealer hidden in dependency)
- `ua-parser-js` malware (cryptominer in popular package)
- `coa` and `rc` hijacks (maintainer account takeovers)

---

## Alternative: Skip Setup (Not Recommended)

If you want to skip Socket.dev for now:

```bash
# Remove the workflow
rm .github/workflows/socket-security.yml

# Update SECURITY.md to remove Socket.dev mention
# Edit: Remove Socket.dev from "Dependency Vulnerabilities" section
```

But for a **compliance tool**, having comprehensive security is a trust signal.

---

## Security Badge (Optional)

After setup, add to README.md:

```markdown
[![Socket Badge](https://socket.dev/api/badge/npm/package/@ansvar/eu-regulations-mcp)](https://socket.dev/npm/package/@ansvar/eu-regulations-mcp)
```

Shows real-time security score to users.

---

**Questions?** hello@ansvar.ai
