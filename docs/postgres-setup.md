# PostgreSQL Setup Guide

This guide covers migrating from SQLite to PostgreSQL for production deployment (Teams/Copilot integration).

## Why PostgreSQL?

- **Concurrent access**: SQLite doesn't support multiple simultaneous writers
- **Scalability**: PostgreSQL handles thousands of concurrent connections
- **Enterprise-ready**: Managed services available on all major clouds
- **Better full-text search**: Native `tsvector`/`tsquery` vs SQLite's FTS5

## Local Development Setup

### Option 1: Docker (Recommended)

```bash
# Start PostgreSQL container
docker run -d \
  --name eu-regs-postgres \
  -e POSTGRES_DB=eu_regulations \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  postgres:16-alpine

# Verify it's running
docker ps | grep eu-regs-postgres
```

### Option 2: Native Installation

**macOS (Homebrew):**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb eu_regulations
```

**Ubuntu/Debian:**
```bash
sudo apt-get install postgresql-16
sudo systemctl start postgresql
sudo -u postgres createdb eu_regulations
```

**Windows:**
Download from [postgresql.org/download/windows](https://www.postgresql.org/download/windows/)

## Running the Migration

```bash
# Set DATABASE_URL environment variable
export DATABASE_URL="postgresql://postgres:postgres@localhost:5432/eu_regulations"

# Run migration script
npm run migrate:postgres
```

**Expected output:**
```
🚀 Starting SQLite → PostgreSQL migration

📂 Opening SQLite database: .../data/regulations.db
🔌 Connecting to PostgreSQL: postgresql://***@localhost:5432/eu_regulations

📝 Creating PostgreSQL schema...
✅ Schema created

📋 Migrating regulations...
   SQLite: 37 rows
   Postgres: 37 rows

📄 Migrating articles...
   SQLite: 2278 rows
   Postgres: 2278 rows

... (more tables) ...

============================================================
📊 Migration Summary
============================================================
✅ regulations         | SQLite:    37 | Postgres:    37
✅ articles            | SQLite:  2278 | Postgres:  2278
✅ recitals            | SQLite:  3508 | Postgres:  3508
✅ definitions         | SQLite:  1145 | Postgres:  1145
✅ control_mappings    | SQLite:   686 | Postgres:   686
✅ applicability_rules | SQLite:   305 | Postgres:   305
✅ source_registry     | SQLite:    37 | Postgres:    37
============================================================

✅ Migration completed successfully!
```

## Production Deployment

### Azure Database for PostgreSQL

```bash
# Create resource group
az group create --name eu-regs-rg --location westeurope

# Create PostgreSQL server
az postgres flexible-server create \
  --resource-group eu-regs-rg \
  --name eu-regs-db \
  --location westeurope \
  --admin-user postgres \
  --admin-password <strong-password> \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --version 16 \
  --storage-size 32

# Get connection string
az postgres flexible-server show-connection-string \
  --server-name eu-regs-db \
  --database-name eu_regulations \
  --admin-user postgres \
  --admin-password <strong-password>
```

### AWS RDS PostgreSQL

```bash
# Using AWS CLI
aws rds create-db-instance \
  --db-instance-identifier eu-regs-db \
  --db-instance-class db.t4g.micro \
  --engine postgres \
  --engine-version 16.2 \
  --master-username postgres \
  --master-user-password <strong-password> \
  --allocated-storage 20 \
  --storage-type gp3 \
  --publicly-accessible \
  --db-name eu_regulations
```

### DigitalOcean Managed PostgreSQL

```bash
# Via web UI:
# 1. Create → Databases → PostgreSQL 16
# 2. Choose Basic plan ($15/month)
# 3. Select region closest to your API servers
# 4. Copy connection string
```

## Connection String Format

```
postgresql://username:password@host:port/database

# Examples:
# Local: postgresql://postgres:postgres@localhost:5432/eu_regulations
# Azure: postgresql://postgres@eu-regs-db:password@eu-regs-db.postgres.database.azure.com:5432/eu_regulations
# AWS: postgresql://postgres:password@eu-regs-db.abc123.us-east-1.rds.amazonaws.com:5432/eu_regulations
```

## Verifying Migration

```bash
# Connect to PostgreSQL
psql $DATABASE_URL

# Run test queries
\dt                              -- List tables
SELECT COUNT(*) FROM articles;   -- Should return 2278
SELECT COUNT(*) FROM recitals;   -- Should return 3508

# Test full-text search
SELECT regulation, article_number, title
FROM articles
WHERE to_tsvector('english', title || ' ' || text) @@ plainto_tsquery('english', 'incident reporting')
LIMIT 5;

\q  -- Exit
```

## Performance Tuning

For production, add these indexes (already included in migration):

```sql
-- Already created by migration script:
CREATE INDEX articles_fts_idx ON articles USING GIN (to_tsvector('english', title || ' ' || text));
CREATE INDEX articles_regulation_idx ON articles(regulation);
CREATE INDEX definitions_term_idx ON definitions(term);
CREATE INDEX recitals_fts_idx ON recitals USING GIN (to_tsvector('english', text));
```

## Backup Strategy

```bash
# Backup PostgreSQL database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql

# Restore from backup
psql $DATABASE_URL < backup-20260127.sql
```

## Rollback to SQLite

If you need to revert to SQLite:

1. Keep `data/regulations.db` as backup
2. Update environment to not set DATABASE_URL
3. MCP server will automatically use SQLite if DATABASE_URL is not set

## Troubleshooting

### Connection refused
- Check PostgreSQL is running: `docker ps` or `brew services list`
- Verify port 5432 is open: `lsof -i :5432`

### Permission denied
- Check database exists: `psql -l`
- Verify user has access: `psql $DATABASE_URL -c '\du'`

### Migration fails midway
- Script uses transactions - automatically rolls back on error
- Check error message for specific issue
- Re-run migration (uses ON CONFLICT DO NOTHING for idempotency)

## Cost Estimates

| Provider | Tier | Storage | Price |
|----------|------|---------|-------|
| DigitalOcean | Basic | 10GB | $15/month |
| Azure | B1ms | 32GB | $25/month |
| AWS RDS | t4g.micro | 20GB | $20/month |
| Render | Starter | 1GB | $7/month |

All support 10-100 concurrent connections (sufficient for Teams plugin with 1,000-10,000 users).
