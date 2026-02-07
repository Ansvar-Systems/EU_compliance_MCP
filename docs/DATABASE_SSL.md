# Database SSL/TLS Configuration

## Overview

This project uses **secure-by-default** SSL/TLS for PostgreSQL connections in production. This guide explains the configuration options and when to use each mode.

## Quick Start

### Managed Postgres Providers (Recommended)

Most managed providers use valid certificates - **no configuration needed**:

```bash
# Neon, Supabase, AWS RDS, DigitalOcean, etc.
DATABASE_URL=postgresql://user:pass@host.neon.tech/db
NODE_ENV=production
# ✅ SSL enabled automatically with certificate validation
```

### Local Development

```bash
# Local PostgreSQL without SSL
DATABASE_URL=postgresql://localhost:5432/mydb
NODE_ENV=development
# ✅ SSL disabled automatically in development mode
```

### Self-Hosted with Self-Signed Certificates

```bash
DATABASE_URL=postgresql://user:pass@myserver.com/db
DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/path/to/ca-certificate.crt
NODE_ENV=production
```

---

## SSL Modes

Configure via the `DATABASE_SSL_MODE` environment variable:

### `require` (Default in Production)

**Use for**: Managed Postgres providers (Neon, Supabase, AWS RDS, Azure, GCP, etc.)

```bash
DATABASE_SSL_MODE=require
```

- ✅ Encrypts all traffic
- ✅ Validates server certificate against system CA bundle
- ✅ Protects against Man-in-the-Middle attacks
- ✅ Works with any provider using valid CA-signed certificates

**Security Level**: 🟢 High (Recommended)

---

### `verify-ca` (Custom CA Certificates)

**Use for**: Self-hosted Postgres with self-signed certificates

```bash
DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/etc/ssl/certs/postgres-ca.crt
```

- ✅ Encrypts all traffic
- ✅ Validates against your custom CA certificate
- ⚠️ Requires maintaining CA certificate file

**Security Level**: 🟢 High (for self-hosted)

**How to get your CA certificate**:
```bash
# From PostgreSQL server
psql "sslmode=require" -c "SELECT * FROM pg_stat_ssl" --csv

# Or from your hosting provider's dashboard
# Example: DigitalOcean → Database → Connection Details → Download CA Certificate
```

---

### `disable` (Development Only)

**Use for**: Local development without SSL

```bash
DATABASE_SSL_MODE=disable
```

- ⚠️ **No encryption** - all traffic sent in plaintext
- ⚠️ Credentials visible on network
- ❌ **Never use in production**

**Security Level**: 🔴 None (Development only)

---

### `allow` (Not Recommended)

Attempts SSL, falls back to plaintext if unavailable.

```bash
DATABASE_SSL_MODE=allow
```

- ⚠️ May silently downgrade to plaintext
- ❌ Not recommended - use explicit `require` or `disable`

**Security Level**: 🟡 Low (Avoid)

---

## Auto-Detection (No Configuration)

If `DATABASE_SSL_MODE` is not set, the system auto-detects:

| Environment | SSL Behavior |
|-------------|--------------|
| `NODE_ENV=production` | Enabled with validation (`require`) |
| `NODE_ENV=development` | Disabled (`disable`) |
| `NODE_ENV=test` | Disabled (`disable`) |

---

## Troubleshooting

### Error: "self signed certificate"

**Problem**: Your Postgres server uses a self-signed certificate, but you're using `require` mode.

**Solution**: Use `verify-ca` mode with your CA certificate:

```bash
DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/path/to/ca.crt
```

**How to get the CA certificate**:
```bash
# From PostgreSQL server logs or data directory
# Location depends on your setup:
# - /var/lib/postgresql/data/root.crt
# - /etc/postgresql/*/main/root.crt
# - Or download from your hosting provider's dashboard
```

---

### Error: "unable to verify the first certificate"

**Problem**: Your Postgres server's certificate chain is incomplete.

**Solution**:
1. **Preferred**: Fix the server's certificate chain (contact your hosting provider)
2. **Temporary**: Use `verify-ca` with the root CA certificate

```bash
# Download the root CA certificate
curl -o /tmp/postgres-ca.crt https://your-db-provider.com/ca.crt

DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/tmp/postgres-ca.crt
```

---

### Warning: "DATABASE_SSL_MODE=disable in production"

**Problem**: You're disabling SSL in production, exposing credentials and data.

**Why this is dangerous**:
- Database credentials sent in plaintext
- Query data visible to network attackers
- Vulnerable to Man-in-the-Middle attacks

**Solution**:
1. **Managed providers**: Remove `DATABASE_SSL_MODE` (auto-enables SSL)
2. **Self-hosted**: Use `verify-ca` with your CA certificate
3. **Local dev only**: This warning is safe to ignore in development

---

## Security Best Practices

### ✅ DO

- **Use managed providers** (Neon, Supabase, AWS RDS) - they handle certificates
- **Enable SSL in production** (default behavior, no config needed)
- **Use `verify-ca`** for self-hosted Postgres with self-signed certs
- **Rotate CA certificates** periodically (if using custom CAs)
- **Test SSL** with `psql "sslmode=verify-full"` before deploying

### ❌ DON'T

- **Never disable SSL in production** (`DATABASE_SSL_MODE=disable`)
- **Never use `rejectUnauthorized: false`** (exposes to MitM attacks)
- **Don't ignore certificate errors** - they indicate real problems
- **Don't commit certificates** to git (use environment variables)

---

## Comparing with Other Databases

| Database | This Project | Insecure Alternative |
|----------|--------------|----------------------|
| PostgreSQL (Managed) | `require` (auto) | `rejectUnauthorized: false` ❌ |
| PostgreSQL (Self-Hosted) | `verify-ca` + CA cert | `sslmode=allow` ❌ |
| Local Dev | `disable` (auto) | Same ✅ |

---

## Migration from Insecure Configs

If you previously used insecure SSL settings:

### Before (Insecure ❌)
```javascript
ssl: { rejectUnauthorized: false }
```
```bash
DATABASE_SSL_REJECT_UNAUTHORIZED=false
```

### After (Secure ✅)

#### For Managed Providers
```bash
# No configuration needed! Remove the insecure env var
unset DATABASE_SSL_REJECT_UNAUTHORIZED
```

#### For Self-Hosted
```bash
DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/path/to/your-ca.crt
```

---

## Testing Your Configuration

### Test SSL is Enabled
```bash
# Should show SSL info
psql "$DATABASE_URL?sslmode=require" -c "SELECT * FROM pg_stat_ssl WHERE pid = pg_backend_pid();"
```

### Test Certificate Validation
```bash
# Should succeed with valid cert
psql "$DATABASE_URL?sslmode=verify-full" -c "SELECT 1;"

# Should fail with invalid cert (good!)
psql "postgresql://wrong-host:5432/db?sslmode=verify-full" -c "SELECT 1;"
```

### Verify from Application
```typescript
import { createConnection } from './database/connection';

const db = createConnection();
const isConnected = await db.testConnection();
console.log('Database SSL:', isConnected ? '✅ Connected' : '❌ Failed');
```

---

## Provider-Specific Guides

### Neon
```bash
DATABASE_URL=postgresql://user:pass@ep-xxx.us-east-2.aws.neon.tech/db
# ✅ No SSL config needed - Neon uses valid certificates
```

### Supabase
```bash
DATABASE_URL=postgresql://postgres:pass@db.xxx.supabase.co:5432/postgres
# ✅ No SSL config needed - Supabase uses valid certificates
```

### AWS RDS
```bash
DATABASE_URL=postgresql://user:pass@mydb.xxx.us-east-1.rds.amazonaws.com/db
# ✅ No SSL config needed - RDS uses valid certificates
```

### Railway
```bash
DATABASE_URL=postgresql://postgres:pass@roundhouse.proxy.rlwy.net:12345/railway
# ✅ No SSL config needed - Railway uses valid certificates
```

### Self-Hosted (Docker)
```bash
# Generate self-signed cert (for testing only)
openssl req -new -x509 -days 365 -nodes -text -out server.crt -keyout server.key

# Configure PostgreSQL
ssl = on
ssl_cert_file = '/var/lib/postgresql/server.crt'
ssl_key_file = '/var/lib/postgresql/server.key'

# Application config
DATABASE_SSL_MODE=verify-ca
DATABASE_SSL_CA_CERT=/path/to/server.crt
```

---

## References

- [PostgreSQL SSL Support](https://www.postgresql.org/docs/current/libpq-ssl.html)
- [node-postgres SSL](https://node-postgres.com/features/ssl)
- [OWASP Transport Layer Protection](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)
- [NIST SP 800-52 Rev 2](https://csrc.nist.gov/publications/detail/sp/800-52/rev-2/final)

---

## Support

**Having SSL issues?** Open an issue: https://github.com/Ansvar-Systems/EU_compliance_MCP/issues

**Security concerns?** Email: security@ansvar.eu
