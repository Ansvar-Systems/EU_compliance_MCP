# Microsoft Teams Extension

Microsoft Teams message extension for EU Regulations search.

## Setup Instructions

### 1. Create Azure AD App Registration

```bash
# Go to Azure Portal → Azure Active Directory → App Registrations
# Click "New registration"

Name: EU Regulations Bot
Supported account types: Multitenant
Redirect URI: (leave blank for now)

# After creation, copy:
# - Application (client) ID
# - Directory (tenant) ID
```

### 2. Configure API Permissions

In your app registration:
1. Go to "API permissions"
2. Add permissions:
   - Microsoft Graph → Delegated → `User.Read`
   - Microsoft Graph → Delegated → `email`
   - Microsoft Graph → Delegated → `openid`
   - Microsoft Graph → Delegated → `profile`

3. Grant admin consent (if required by your org)

### 3. Create Bot Registration

```bash
# Go to Azure Portal → Create a resource → Bot
# Search for "Azure Bot"

Bot handle: eu-regulations-bot
Pricing tier: F0 (Free for testing)
App ID: (use the app ID from step 1)
Messaging endpoint: https://YOUR-API-DOMAIN.com/api/messages

# After creation:
# - Go to Channels
# - Add "Microsoft Teams" channel
```

### 4. Update Manifest

Edit `manifest.json` and replace:

```json
"id": "YOUR-APP-ID-HERE",
"botId": "YOUR-APP-ID-HERE",
"validDomains": ["YOUR-API-DOMAIN.com"],
"webApplicationInfo": {
  "id": "YOUR-APP-ID-HERE",
  "resource": "api://YOUR-API-DOMAIN.com/YOUR-APP-ID-HERE"
}
```

### 5. Create App Icons

You need two icon files:

**`icons/color.png`** - 192x192px, full color app icon
**`icons/outline.png`** - 32x32px, white outline on transparent background

Design guidelines:
- Use your company/product branding
- Color icon should be recognizable at small sizes
- Outline icon must be white on transparent (for dark theme)

Tools:
- Design: Figma, Canva, Photoshop
- Generate: [realfavicongenerator.net](https://realfavicongenerator.net)

### 6. Package the App

```bash
# Create app package
cd packages/teams-extension
zip -r eu-regulations.zip manifest.json icons/

# Verify package
# - File size < 50MB
# - Contains manifest.json at root
# - Contains icons/ folder with both PNGs
```

### 7. Deploy REST API

Deploy your REST API first (see `packages/rest-api/README.md`):

```bash
# Deploy to cloud provider
# Get API URL (e.g., https://api.example.com)

# Test health endpoint
curl https://api.example.com/health

# Update manifest.json validDomains with this URL
```

### 8. Test in Teams

**Developer Upload (for testing):**

1. Open Microsoft Teams
2. Go to Apps → Manage your apps → Upload an app
3. Click "Upload a custom app"
4. Select `eu-regulations.zip`
5. Click "Add" to install

**Test the extension:**

1. Open any chat or channel
2. Click the "+" below compose box
3. Find "EU Regulations"
4. Search for "GDPR breach notification"
5. Select a result to insert into chat

### 9. Publish to Commercial Marketplace

**Requirements:**
- Azure AD app must be multitenant
- Privacy policy and terms of use URLs must be public
- App icons must meet design guidelines
- App must pass validation checks

**Steps:**
1. Go to [Partner Center](https://partner.microsoft.com/dashboard)
2. Create new offer → Microsoft Teams app
3. Upload app package
4. Fill out marketplace listing:
   - Description (from manifest)
   - Screenshots (4-5 images showing app in use)
   - Categories (Productivity, Compliance)
   - Support info (hello@ansvar.ai)
5. Submit for review (7-10 business days)

### 10. Monitor Usage

**Application Insights:**
```bash
# Add to REST API
npm install @azure/monitor-opentelemetry

# Configure in server.ts
import { useAzureMonitor } from "@azure/monitor-opentelemetry";
useAzureMonitor({
  connectionString: process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
});
```

**Key Metrics:**
- API request rate (requests/min)
- Search queries (top terms)
- Error rate (5xx responses)
- Response time (p50, p95, p99)
- Active tenants (unique organizations)

## Troubleshooting

### "Bot not found" error
- Check bot ID in manifest matches Azure Bot registration
- Verify messaging endpoint is reachable
- Check bot is enabled in Teams channel

### Authentication fails
- Verify app ID in manifest matches Azure AD app
- Check API permissions are granted
- Ensure token audience matches API resource URI

### Search returns no results
- Check DATABASE_URL is set in API deployment
- Verify PostgreSQL migration completed successfully
- Test API endpoint directly with curl

### Rate limit errors
- Check if your organization exceeded 100 req/min
- Contact hello@ansvar.ai for enterprise tier

## Support

- Documentation: [github.com/Ansvar-Systems/EU_compliance_MCP](https://github.com/Ansvar-Systems/EU_compliance_MCP)
- Email: hello@ansvar.ai
- Issues: [github.com/Ansvar-Systems/EU_compliance_MCP/issues](https://github.com/Ansvar-Systems/EU_compliance_MCP/issues)
