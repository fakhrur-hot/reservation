# Deployment Guide

This guide covers deploying the Stage 1 Table Booking Core to production environments.

## Table of Contents

1. [Plain Linux Server Deployment](#plain-linux-server-deployment)
2. [Docker Compose Setup](#docker-compose-setup)
3. [PostgreSQL Configuration](#postgresql-configuration)
4. [Redis Configuration](#redis-configuration)
5. [Migration Run Order](#migration-run-order)
6. [Seeding Workflow](#seeding-workflow)
7. [Validation Checklist](#validation-checklist)
8. [Troubleshooting](#troubleshooting)

---

## Plain Linux Server Deployment

### Prerequisites

- Ubuntu 20.04 LTS or later (or equivalent Linux distribution)
- Node.js 18+ installed via nvm or package manager
- PostgreSQL 15+ installed and running
- Redis 7+ installed and running
- Nginx or Apache for reverse proxy (optional but recommended)

### Installation Steps

1. **Clone the repository:**
```bash
cd /opt
git clone https://github.com/your-org/tablebook.git
cd tablebook
```

2. **Install dependencies:**
```bash
npm ci --production
```

3. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with production values
nano .env
```

4. **Build the application:**
```bash
npm run build
```

5. **Run migrations and seeds:**
```bash
npm run migrate
```

6. **Start the application:**
```bash
npm start
```

Or use a process manager like PM2:
```bash
npm install -g pm2
pm2 start dist/index.js --name tablebook
pm2 save
pm2 startup
```

### Nginx Reverse Proxy Configuration

```nginx
upstream tablebook {
    server localhost:3001;
}

server {
    listen 80;
    server_name api.restaurant.com;

    location / {
        proxy_pass http://tablebook;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

---

## Docker Compose Setup

### Local Development

```bash
docker-compose up -d
npm run dev
```

### Staging Environment

Create `docker-compose.staging.yml`:

```yaml
version: '3.9'

services:
  api:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=staging
      - DATABASE_URL=postgresql://tablebook:${DB_PASSWORD}@postgres:5432/tablebook
      - REDIS_URL=redis://redis:6379
      - JWT_SECRET=${JWT_SECRET}
      - SENTRY_DSN=${SENTRY_DSN}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_started
    restart: unless-stopped

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tablebook
      POSTGRES_USER: tablebook
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U tablebook"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    restart: unless-stopped

volumes:
  postgres_data:
```

Deploy:
```bash
docker-compose -f docker-compose.staging.yml up -d
```

---

## PostgreSQL Configuration

### Connection String Format

```
postgresql://username:password@host:port/database
```

Example:
```
postgresql://tablebook:secure_password@db.example.com:5432/tablebook_prod
```

### Performance Tuning

For production, adjust these PostgreSQL settings in `postgresql.conf`:

```ini
# Connection pooling
max_connections = 200
shared_buffers = 256MB
effective_cache_size = 1GB
work_mem = 4MB

# Query optimization
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging
log_min_duration_statement = 1000  # Log queries > 1 second
log_statement = 'mod'              # Log DDL and DML
```

### Backup Strategy

Daily backups:
```bash
#!/bin/bash
BACKUP_DIR="/backups/tablebook"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump postgresql://tablebook:password@localhost/tablebook | gzip > $BACKUP_DIR/tablebook_$TIMESTAMP.sql.gz
```

---

## Redis Configuration

### Connection String Format

```
redis://[:password@]host:port[/db]
```

Example:
```
redis://redis.example.com:6379/0
```

### Production Configuration

In `redis.conf`:

```ini
# Memory management
maxmemory 512mb
maxmemory-policy allkeys-lru

# Persistence
save 900 1
save 300 10
save 60 10000

# Replication (if using Redis Sentinel)
replicaof master-host 6379
```

### Monitoring

Monitor Redis memory and connection count:
```bash
redis-cli INFO memory
redis-cli INFO clients
```

---

## Migration Run Order

All 28 migrations are applied in numeric order. Each migration is idempotent and safe to re-run.

| File | Description |
|------|-------------|
| `001_core_tables.sql` | Core tables: branches, sections, tables, staff, roles, customers, reservations |
| `002_business_hours_tables.sql` | Business hours and operating schedule tables |
| `003_reservation_sequences_table.sql` | Reservation reference number sequence |
| `004_deposit_transactions_table.sql` | Deposit transaction tracking |
| `005_audit_log_table.sql` | Audit logging for compliance |
| `006_dormant_stage2_tables.sql` | Stage 2 placeholder tables (dormant) |
| `007_dormant_stage3_tables.sql` | Stage 3 placeholder tables (dormant) |
| `008_seed_default_data.sql` | No-op (data migration moved to seed layer) |
| `009_multi_vendor_tables.sql` | Multi-vendor support tables |
| `010_vendor_commission_tables.sql` | No-op (superseded by migration 025) |
| `011_add_missing_data_fields.sql` | Additional data fields for reservations |
| `012_vendor_account_tables.sql` | Vendor account management |
| `013_commission_transactions_table.sql` | No-op (superseded by migration 025) |
| `014_stage1_optional_services_tables.sql` | Optional services (decorations, cakes) |
| `015_seed_default_data.sql` | No-op (data migration moved to seed layer) |
| `016_business_hours_unique_constraint.sql` | Unique constraint on business hours |
| `017_walk_ins_table.sql` | Walk-in guest tracking |
| `018_notification_settings.sql` | Notification preferences |
| `019_branch_printer_config.sql` | Thermal printer configuration |
| `020_reservation_occasion_fields.sql` | Occasion type and notes |
| `021_decoration_package_price.sql` | Decoration pricing |
| `022_deposit_transactions_decoration_amount.sql` | Decoration amount in deposits |
| `023_staff_created_by.sql` | Staff creation audit trail |
| `024_cake_menu_items.sql` | Cake menu items |
| `025_commission_schema_v2.sql` | Commission schema version 2 |
| `026_seed_commission_defaults.sql` | Commission default values |
| `027_commission_refund_failure_reason.sql` | Commission refund failure tracking |
| `028_app_config.sql` | Application configuration key-value store |

---

## Seeding Workflow

The seeding system runs automatically after migrations complete. It consists of three layers:

### Layer 1: System Seed

**When:** Runs once on first startup
**What:** Inserts environment-independent defaults
- Roles: `admin`, `manager`, `waiter`
- Operating modes: `TABLE_ONLY`
- Currencies: `MYR` (Malaysian Ringgit)

**Tracking:** Marked as applied in `app_config` table with key `system_seed_applied`

### Layer 2: Default Seed

**When:** Runs once on first startup (after System Seed)
**What:** Inserts placeholder branch and admin account
- Branch: name `[Restaurant_Name]`, code `[BRANCH_CODE]`
- Admin staff: email `[Admin_Email]`, password `[Admin_Password]`

**Tracking:** Marked as applied in `app_config` table with key `default_seed_applied`

**Note:** These placeholder values are replaced when the operator completes the setup wizard.

### Layer 3: Dummy Seed

**When:** Runs only when `NODE_ENV` is `development` or `test`
**What:** Generates fake data for development/testing
- 50+ fake customer records
- 100+ fake reservation records
- Deterministic seed for reproducible results

**Tracking:** Marked as applied in `app_config` table with key `dummy_seed_applied`

### Manual Seed Verification

```bash
npm run verify-seeds
```

This command checks:
- `app_config` table exists
- All three seed layers have been applied (or skipped appropriately)
- No duplicate seed data

---

## Validation Checklist

After deployment, verify the following:

### 1. Database Connectivity
```bash
psql postgresql://tablebook:password@localhost/tablebook -c "SELECT version();"
```
✓ Should return PostgreSQL version

### 2. All Migrations Applied
```bash
psql postgresql://tablebook:password@localhost/tablebook -c "SELECT COUNT(*) FROM migrations;"
```
✓ Should return 28

### 3. Core Tables Exist
```bash
psql postgresql://tablebook:password@localhost/tablebook -c "\dt"
```
✓ Should list: branches, sections, tables, staff, customers, reservations, app_config, etc.

### 4. Seed Data Applied
```bash
psql postgresql://tablebook:password@localhost/tablebook -c "SELECT * FROM app_config WHERE key LIKE '%seed%';"
```
✓ Should show: system_seed_applied, default_seed_applied, (dummy_seed_applied if dev/test)

### 5. Redis Connectivity
```bash
redis-cli ping
```
✓ Should return PONG

### 6. API Health Check
```bash
curl http://localhost:3001/health
```
✓ Should return HTTP 200 with status information

### 7. Setup Status
```bash
curl http://localhost:3001/setup/status
```
✓ Should return `{"setupRequired": true}` on fresh database

### 8. Default Branch Exists
```bash
psql postgresql://tablebook:password@localhost/tablebook -c "SELECT id, name, code FROM branches LIMIT 1;"
```
✓ Should return one row with placeholder values

---

## Troubleshooting

### Migration Failures

**Error:** `relation "xyz" does not exist`

**Solution:** Check that migrations are running in order. Verify no migrations were manually skipped:
```bash
psql -c "SELECT * FROM migrations ORDER BY id;"
```

**Error:** `duplicate key value violates unique constraint`

**Solution:** A migration may have been run twice. Check `migrations` table and manually remove duplicate entries if needed.

### Seed Data Issues

**Error:** `Seed layer failed: duplicate key value`

**Solution:** The seed layer was partially applied. Check `app_config` table:
```bash
psql -c "SELECT * FROM app_config WHERE key LIKE '%seed%';"
```

If a layer is marked as applied but incomplete, manually delete the tracking record:
```bash
DELETE FROM app_config WHERE key = 'system_seed_applied';
```

Then restart the application to re-run the seed.

### Setup Wizard Not Appearing

**Error:** Redirected to `/tables` instead of `/setup`

**Solution:** Check if setup is already marked complete:
```bash
psql -c "SELECT * FROM app_config WHERE key = 'setup_completed';"
```

If setup was completed with placeholder values, you can reset it:
```bash
DELETE FROM app_config WHERE key = 'setup_completed';
DELETE FROM app_config WHERE key = 'setup_progress';
```

Then refresh the browser.

### Database Connection Timeout

**Error:** `connect ECONNREFUSED 127.0.0.1:5432`

**Solution:** Verify PostgreSQL is running:
```bash
sudo systemctl status postgresql
```

Check `DATABASE_URL` environment variable is correct:
```bash
echo $DATABASE_URL
```

### Redis Connection Issues

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:6379`

**Solution:** Verify Redis is running:
```bash
redis-cli ping
```

Check `REDIS_URL` environment variable is correct:
```bash
echo $REDIS_URL
```

### High Memory Usage

**Solution:** Check Redis memory:
```bash
redis-cli INFO memory
```

If Redis memory is high, clear old keys:
```bash
redis-cli FLUSHDB
```

Or configure Redis eviction policy in `redis.conf`:
```ini
maxmemory-policy allkeys-lru
```

### Slow Queries

**Solution:** Enable slow query logging in PostgreSQL:
```sql
ALTER SYSTEM SET log_min_duration_statement = 1000;
SELECT pg_reload_conf();
```

Then check logs:
```bash
tail -f /var/log/postgresql/postgresql.log | grep "duration:"
```

---

## Support

For issues or questions, refer to:
- Application logs: `npm run dev` (development) or PM2 logs (production)
- Database logs: PostgreSQL log file
- Redis logs: Redis log file
