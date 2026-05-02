# Quick Fix Guide: Infrastructure Test Failures
**Goal**: Fix CRITICAL issues to unblock 100+ tests in 2-3 hours  
**Status**: Ready to implement

---

## Quick Reference: Critical Fixes

### Fix #1: Metrics Service Import (15 min)

**File**: [src/services/__tests__/metrics.service.test.ts](src/services/__tests__/metrics.service.test.ts#L1-L10)

**Current**:
```typescript
import { MetricsService } from '../services/metrics.service';
```

**Change to**:
```typescript
import { MetricsService } from '../metrics.service';
```

**Verify**:
```bash
npx vitest run src/services/__tests__/metrics.service.test.ts
# Should load and run tests instead of failing with "file not found"
```

---

### Fix #2: Health Endpoint Response Format (45 min)

**Issue**: Tests expect `postgres` and `redis` properties, but health endpoint doesn't return them.

**Files to Check**:
- `src/routes/health.routes.ts` (or similar health endpoint)
- `src/index.ts` (if health is registered there)

**Expected Response**:
```json
{
  "status": "ok",
  "postgres": "up",
  "redis": "up",
  "timestamp": "2026-04-17T00:16:00.000Z"
}
```

**Test Expectations** (from [src/tests/validation/01-health.test.ts](src/tests/validation/01-health.test.ts#L39-L45)):
```typescript
expect(['up', 'ok'].includes(body.postgres as string)).toBe(true);
expect(['up', 'ok'].includes(body.redis as string)).toBe(true);
expect(res.status).toBe(200);
```

**Fix Pattern**:
```typescript
app.get('/health', async (req, res) => {
  try {
    // Check PostgreSQL
    const pgCheck = await pool.query('SELECT NOW()');
    const pgUp = pgCheck.rows.length > 0 ? 'up' : 'down';
    
    // Check Redis
    const redisUp = redis.isReady ? 'up' : 'down';
    
    // Return standard format
    return res.status(200).json({
      status: 'ok',
      postgres: pgUp,
      redis: redisUp,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(503).json({
      status: 'degraded',
      postgres: 'down',
      redis: 'down',
      error: err.message
    });
  }
});
```

**Verify**:
```bash
curl -s http://localhost:3001/health | jq '.'
# Should see: {"status": "ok", "postgres": "up", "redis": "up", ...}

npm run test:run src/tests/validation/01-health.test.ts
# Should pass health check (5+ tests unblocked)
```

---

### Fix #3: Schema Query - Remove branch_code (30 min)

**Issue**: Tests query for `branch_code` column that doesn't exist.

**Affected Files**:
- `src/tests/smoke.test.ts` (line 28)
- `src/tests/setup-integration.test.ts` (if similar queries exist)

**Current Query** (in [src/tests/smoke.test.ts](src/tests/smoke.test.ts#L25-L30)):
```typescript
const branchResult = await pool.query(
  "SELECT id FROM branches WHERE branch_code = '[BRANCH_CODE]' LIMIT 1"
);
```

**Change to**:
```typescript
const branchResult = await pool.query(
  "SELECT id FROM branches ORDER BY created_at LIMIT 1"
);
```

**Why**: The `branches` table has `id` (UUID primary key) and `created_at`, but no `branch_code` column. This will always throw a "column doesn't exist" error.

**Alternative** (if branch_code should exist):
```sql
-- Check actual schema
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'branches';
```

**Verify**:
```bash
npm run test:run src/tests/smoke.test.ts
# Should run schema tests instead of failing immediately on query error
```

---

## Order of Implementation

**Step 1** (15 min): Fix metrics import
```bash
# Edit: src/services/__tests__/metrics.service.test.ts
# Then run:
npx vitest run src/services/__tests__/metrics.service.test.ts
```

**Step 2** (45 min): Fix health endpoint
```bash
# Find and edit health endpoint implementation
# Quick check:
curl -s http://localhost:3001/health | jq '.'
# Then run:
npm run test:run src/tests/validation/01-health.test.ts
```

**Step 3** (30 min): Fix schema queries
```bash
# Edit: src/tests/smoke.test.ts (line 28)
# Then run:
npm run test:run src/tests/smoke.test.ts
```

**Verify All Fixes**:
```bash
npm run test:run
# Expected output:
# Test Files: 10-12 failed | 8-10 passed (20)
# Tests: 110-130 failed | 283-303 passed (413)
# (Significant improvement from 169 failed)
```

---

## Expected Improvements

| Fix | Current | After Fix | Tests Unblocked |
|-----|---------|-----------|-----------------|
| Metrics import | 0 tests | 40+ tests | +40 |
| Health properties | 60% failures | 90%+ pass | +50 |
| Schema queries | Throws error | Proceeds | +40 |
| **TOTAL** | **169 failing** | **~100 failing** | **+130 passing** |

---

## Testing After Fixes

```bash
# Quick validation
npm run test:run src/services/**/*.test.ts
# Should see: 157 tests passing ✅

# Full suite
npm run test:run
# Should see: 280-300 tests passing (from current 244)

# Specific validations
npm run test:run src/tests/validation/01-health.test.ts
npm run test:run src/tests/validation/02-schema.test.ts  
npm run test:run src/tests/smoke.test.ts
```

---

## Troubleshooting

### Health Check Still Fails
```bash
# Check endpoint manually
curl -v http://localhost:3001/health

# Check backend logs
# Look for ANY POST-startup errors about health route registration

# Verify PostgreSQL is running
psql -h localhost -U postgres -c "SELECT 1"

# Verify Redis is running  
redis-cli PING
```

### Schema Query Still Fails
```bash
# Check actual columns
psql -h localhost -U postgres -d table_booking -c "\d branches"

# Verify seeds ran
psql -h localhost -U postgres -d table_booking -c "SELECT COUNT(*) FROM branches"

# Should return count > 0
```

### Tests Still Can't Connect
```bash
# Ensure backend is running
curl -s http://localhost:3001/health | jq '.'

# Check connection pooling
# Look for "connection pool" in startup logs

# Verify .env variables
cat .env | grep DB_
```

---

## Completion Checklist

After implementing all 3 fixes:

- [ ] **Fix 1**: Metrics import path updated
  - [ ] Edit complete
  - [ ] Tests can load metrics service
  
- [ ] **Fix 2**: Health endpoint returns postgres/redis properties
  - [ ] Endpoint implemented/updated
  - [ ] Manual curl returns expected format
  - [ ] Health validation tests pass

- [ ] **Fix 3**: Schema queries updated (no branch_code)
  - [ ] smoke.test.ts updated
  - [ ] setup-integration.test.ts checked
  - [ ] Schema tests proceed past initial query

- [ ] **Verification**: Full test suite shows improvement
  - [ ] Run `npm run test:run`
  - [ ] Confirm 280+ tests passing (up from 244)
  - [ ] Confirm 100+ tests still failing (down from 169)

---

## Next Steps (After Critical Fixes)

Once all critical fixes are done and tests improve by 130+:

1. **Fix remaining validation tests** (~40 tests)
   - Update ENUM assertions to match schema
   - Fix cascading 503 errors from remaining health issues
   
2. **Verify seed data** (~20 additional tests)
   - Confirm all seed scripts complete
   - Verify default data exists
   
3. **Run full integration suite** 
   - Target: 350+ tests passing (85%+)
   - Validate booking flow end-to-end
   
4. **Performance validation** (separate effort)
   - Load testing with k6
   - Baseline metrics collection

---

## Support Information

**If stuck on**:
- **Metrics import**: Check file paths are correct and __tests__ folder exists
- **Health endpoint**: Verify it's registered as a GET /health route in Fastify
- **Schema queries**: Check column names with `\d branches` in psql

**Quick help**:
```bash
# Get actual branch columns
psql -h localhost -U postgres -d table_booking -c "\d+ branches" 

# Test connection to backend
curl -s http://localhost:3001/health | jq '.postgres'
```
