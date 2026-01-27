# Development Guide

## Setup

```bash
# Clone the repository
git clone https://github.com/Ansvar-Systems/EU_compliance_MCP
cd eu-regulations-mcp

# Install dependencies
npm install

# Run tests
npm test

# Run in development
npm run dev

# Build for production
npm run build
```

---

## Adding New Regulations

Adding a regulation is a single command — it's automatically monitored for updates:

```bash
# Ingest an EU regulation from EUR-Lex
npx tsx scripts/ingest-eurlex.ts 32024R1183 data/seed/eidas2.json
npm run build:db

# That's it. The regulation is now:
# - In the database
# - Automatically monitored by daily EUR-Lex checker
# - Included in auto-update workflow
```

---

## Freshness Monitoring

A GitHub Actions workflow runs daily at 6 AM UTC to ensure regulations stay current:

- **Checks EUR-Lex RSS feeds** for recent legislative changes
- **Compares versions** against local database
- **Creates GitHub issues** when updates are available
- **Auto-closes issues** when regulations are current

To manually check for updates:

```bash
npm run check-updates
```

To trigger auto-update (re-ingest all + publish):
1. Go to Actions → Daily EUR-Lex Update Check
2. Run workflow with `auto_update: true`

---

## Webhook Notifications

Get instant alerts when EUR-Lex updates are detected. All webhooks are optional — the workflow continues to work with GitHub issues if no secrets are configured.

### Slack Setup
1. Create an [Incoming Webhook](https://api.slack.com/messaging/webhooks) in your Slack workspace
2. Add secret `SLACK_WEBHOOK_URL` in repository Settings → Secrets and variables → Actions
3. The workflow will post formatted notifications with links to the issue and workflow run

### Discord Setup
1. Create a webhook in your Discord server settings (Server Settings → Integrations → Webhooks)
2. Add secret `DISCORD_WEBHOOK_URL` in repository settings
3. Optional: Add `DISCORD_MENTION_ROLE_ID` to mention a specific role (get role ID from Discord developer mode)

### Generic Webhook (Microsoft Teams, PagerDuty, etc.)
Add `GENERIC_WEBHOOK_URL` secret to receive JSON payloads:

```json
{
  "event": "regulation_update_detected",
  "timestamp": "2026-01-27T06:00:00Z",
  "repository": "owner/repo",
  "run_url": "https://github.com/owner/repo/actions/runs/123",
  "issue_url": "https://github.com/owner/repo/issues/45",
  "summary": {
    "total_monitored": 37,
    "updates_found": 3,
    "details": "..."
  }
}
```

All webhook notifications use `continue-on-error: true`, so failures won't break the workflow.

---

## Contributing

PRs welcome, especially for:
- Additional regulation coverage
- Improved cross-references
- National transposition details
- Bug fixes and improvements

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.
