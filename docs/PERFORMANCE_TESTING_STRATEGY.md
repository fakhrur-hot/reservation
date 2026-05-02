# Performance Testing Strategy & k6 Scripts

**Status**: Planning & Script Template  
**Target Performance**: P95 < 200ms, P99 < 500ms, Error Rate < 0.1%  
**Tools**: k6 (Grafana), Prometheus, Custom Metrics

---

## Performance Testing Objectives

### 1. Baseline Measurement
- Establish current performance metrics
- Identify bottlenecks
- Document database query performance
- Measure cache effectiveness

### 2. Load Testing
- Concurrent user simulation (1000+ virtual users)
- Sustained load testing (30-60 minute duration)
- Ramp-up scenarios (gradual increase)
- Spike testing (sudden traffic increase)

### 3. Stress Testing
- Find breaking point
- Verify error handling under load
- Check resource cleanup
- Monitor memory leaks

### 4. Endurance Testing
- 24-hour sustained operation
- Monitor memory/CPU trends
- Check for connection pool exhaustion
- Verify cache coherence

---

## Critical Endpoints to Test

### 1. Available Slots Endpoint
**Endpoint**: `GET /api/v1/available-slots`  
**Params**: `branchId`, `date`, `partySize`, `isDecorated`, `promoCode`

**Performance Targets**:
- P50: 50ms
- P95: 150ms
- P99: 300ms
- RPS at target: 500+ RPS

**Test Scenarios**:
- No filters (all tables)
- With promo code validation
- With date range
- Peak booking hours (18:00-22:00)
- Off-peak hours (11:00-14:00)

### 2. Promo Code Validation
**Endpoint**: `POST /api/v1/promo-codes/validate`  
**Payload**: `code`, `branchId`, `bookingType`, `partySize`, `selectedTime`

**Performance Targets**:
- P50: 30ms (cached)
- P95: 100ms (cached)
- P99: 200ms (uncached)
- Cache hit rate: > 95%

**Test Scenarios**:
- Valid codes
- Invalid codes
- Expired codes
- Rapid repeated validation (cache hit)
- Mix of valid/invalid

### 3. Table Lock Operations
**Endpoints**:
- `POST /api/v1/tables/:tableId/lock`
- `POST /api/v1/tables/:tableId/unlock`

**Performance Targets**:
- Lock acquisition: P95 < 50ms
- Lock release: P95 < 30ms
- Concurrent lock attempts handled gracefully

**Test Scenarios**:
- Sequential lock/unlock
- Concurrent lock attempts on same table (conflict handling)
- Lock expiry during load
- Bulk unlock operations

### 4. Reservation Creation
**Endpoint**: `POST /reservations`  
**Payload**: Full booking data with lock ID

**Performance Targets**:
- P50: 150ms
- P95: 400ms
- P99: 750ms
- RPS at target: 100+ RPS

**Test Scenarios**:
- Standard reservations
- Decorated bookings
- With promo codes
- Peak hours
- Transaction rollback on failure

### 5. Metrics & Analytics
**Endpoints**:
- `GET /admin/v1/metrics/bookings`
- `GET /admin/v1/metrics/no-shows`
- `GET /admin/v1/metrics/turnover`
- `GET /admin/v1/metrics/revenue`

**Performance Targets**:
- P95: 500ms (includes caching)
- Cache expiry: 5 minutes
- Background job: < 2 seconds

**Test Scenarios**:
- Single branch metrics
- Multi-branch aggregation
- Date range variations
- Concurrent requests (100+)

---

## k6 Test Scripts

### Setup Guide

```bash
# Install k6
# Windows: choco install k6
# Mac: brew install k6
# Linux: sudo apt-get install k6

# Run simple test
k6 run script.js

# Run with output summary
k6 run --summary-export=summary.json script.js

# Run with InfluxDB output (for Grafana)
k6 run --out csv=results.csv script.js

# Run with custom options
k6 run --vus 100 --duration 30s script.js
```

### Script 1: Available Slots Load Test

```javascript
// File: scripts/load-test-available-slots.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';

// Configuration
const BRANCH_ID = 'branch-1';
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export const options = {
  vus: 50,           // 50 virtual users
  duration: '5m',    // 5 minute test
  thresholds: {
    http_req_duration: ['p(95)<150', 'p(99)<300'],    // Response time
    http_req_failed: ['rate<0.01'],                   // Error rate
    'http_req_duration{staticAsset:yes}': ['p(99)<250'],
  },
};

// Shared variables
const dates = [
  '2026-04-25',
  '2026-04-26',
  '2026-04-27',
];

const partySizes = [1, 2, 3, 4, 6, 8];

export default function () {
  // Test 1: Available slots without filters
  group('Available Slots - No Filters', function () {
    const url = `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=${dates[0]}`;
    const response = http.get(url);

    check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 150ms': (r) => r.timings.duration < 150,
      'has slots': (r) => JSON.parse(r.body).length > 0,
    });

    sleep(1);
  });

  // Test 2: Available slots with party size
  group('Available Slots - With Party Size', function () {
    const partySize = partySizes[Math.floor(Math.random() * partySizes.length)];
    const url = `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=${dates[1]}&partySize=${partySize}`;
    const response = http.get(url);

    check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 150ms': (r) => r.timings.duration < 150,
    });

    sleep(0.5);
  });

  // Test 3: Available slots with decorated flag
  group('Available Slots - Decorated', function () {
    const url = `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=${dates[2]}&isDecorated=true`;
    const response = http.get(url);

    check(response, {
      'status is 200': (r) => r.status === 200,
      'has slots': (r) => JSON.parse(r.body).length > 0,
    });

    sleep(1);
  });

  // Test 4: Peak time simulation (ramped up)
  group('Available Slots - Peak Hours', function () {
    for (let i = 0; i < 5; i++) {
      const url = `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=${dates[0]}`;
      http.get(url);
    }

    sleep(2);
  });
}
```

### Script 2: Promo Code Validation Load Test

```javascript
// File: scripts/load-test-promo-validation.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const BRANCH_ID = 'branch-1';

// Custom metrics
const promoValidationTime = new Trend('promo_validation_time');
const cacheHits = new Counter('promo_cache_hits');
const cacheMisses = new Counter('promo_cache_misses');

export const options = {
  vus: 100,          // 100 virtual users
  duration: '10m',   // 10 minute test
  thresholds: {
    'http_req_duration': ['p(95)<100', 'p(99)<200'],
    'http_req_failed': ['rate<0.01'],
  },
};

const promoCodes = [
  { code: 'PRIORITY24', type: 'priority', valid: true },
  { code: 'TEATIME', type: 'turnover', valid: true },
  { code: 'VIP2024', type: 'vip', valid: true },
  { code: 'INVALID123', type: 'invalid', valid: false },
  { code: 'EXPIRED', type: 'priority', valid: false },
];

export default function () {
  // Test 1: Validate known promo codes (high cache hit)
  group('Promo Validation - Cache Hits', function () {
    const promo = promoCodes[Math.floor(Math.random() * 3)];
    const payload = JSON.stringify({
      code: promo.code,
      branchId: BRANCH_ID,
      bookingType: 'standard',
      partySize: 4,
      selectedTime: '19:00',
    });

    const headers = { 'Content-Type': 'application/json' };
    const start = new Date();
    const response = http.post(
      `${BASE_URL}/api/v1/promo-codes/validate`,
      payload,
      { headers }
    );
    const duration = new Date() - start;

    promoValidationTime.add(duration);
    if (response.status === 200) {
      cacheHits.add(1);
    }

    check(response, {
      'status is 200': (r) => r.status === 200,
      'response time < 100ms': (r) => r.timings.duration < 100,
    });

    sleep(0.5);
  });

  // Test 2: Validate invalid codes (misses)
  group('Promo Validation - Cache Misses', function () {
    const promo = promoCodes[3 + Math.floor(Math.random() * 2)];
    const payload = JSON.stringify({
      code: promo.code,
      branchId: BRANCH_ID,
      bookingType: 'standard',
      partySize: 4,
      selectedTime: '19:00',
    });

    const headers = { 'Content-Type': 'application/json' };
    const response = http.post(
      `${BASE_URL}/api/v1/promo-codes/validate`,
      payload,
      { headers }
    );

    cacheMisses.add(1);

    check(response, {
      'status is 200': (r) => r.status === 200 || r.status === 400,
    });

    sleep(1);
  });

  // Test 3: Rapid sequence validation (stress cache)
  group('Promo Validation - Stress Cache', function () {
    const promo = promoCodes[0];
    for (let i = 0; i < 10; i++) {
      const payload = JSON.stringify({
        code: promo.code,
        branchId: BRANCH_ID,
        bookingType: 'standard',
        partySize: 4,
        selectedTime: '19:00',
      });

      const headers = { 'Content-Type': 'application/json' };
      http.post(
        `${BASE_URL}/api/v1/promo-codes/validate`,
        payload,
        { headers }
      );
    }

    sleep(2);
  });
}
```

### Script 3: Complete Booking Flow Load Test

```javascript
// File: scripts/load-test-complete-booking.js
import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const BRANCH_ID = 'branch-1';
const TABLE_ID = 'table-1';

export const options = {
  vus: 30,           // 30 virtual users
  duration: '5m',    // 5 minute test
  thresholds: {
    'http_req_duration{step:lock}': ['p(95)<50'],
    'http_req_duration{step:reservation}': ['p(95)<400'],
    'http_req_failed': ['rate<0.01'],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // Step 1: Validate promo code
  group('Booking - Validate Promo', function () {
    const promoPayload = JSON.stringify({
      code: 'PRIORITY24',
      branchId: BRANCH_ID,
      bookingType: 'standard',
      partySize: 4,
      selectedTime: '19:00',
    });

    const promoResponse = http.post(
      `${BASE_URL}/api/v1/promo-codes/validate`,
      promoPayload,
      { headers }
    );

    check(promoResponse, {
      'promo validation passed': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // Step 2: Get available slots
  group('Booking - Get Slots', function () {
    const slotsResponse = http.get(
      `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=2026-04-25&partySize=4`
    );

    check(slotsResponse, {
      'slots fetched': (r) => r.status === 200,
    });

    sleep(0.5);
  });

  // Step 3: Acquire table lock
  group('Booking - Lock Table', function () {
    const lockPayload = JSON.stringify({
      branchId: BRANCH_ID,
      durationMinutes: 30,
    });

    const lockResponse = http.post(
      `${BASE_URL}/api/v1/tables/${TABLE_ID}/lock`,
      lockPayload,
      { headers, tags: { step: 'lock' } }
    );

    check(lockResponse, {
      'lock acquired': (r) => r.status === 200,
      'lock latency < 50ms': (r) => r.timings.duration < 50,
    });

    const lock = JSON.parse(lockResponse.body);
    const lockId = lock.id;

    sleep(1);

    // Step 4: Create reservation
    group('Booking - Create Reservation', function () {
      const reservationPayload = JSON.stringify({
        branchId: BRANCH_ID,
        tableId: TABLE_ID,
        customerId: 'customer-1',
        lockId: lockId,
        partySize: 4,
        reservationTime: '2026-04-25T19:00:00Z',
        promoCode: 'PRIORITY24',
        hasDecoration: false,
      });

      const reservationResponse = http.post(
        `${BASE_URL}/api/v1/reservations`,
        reservationPayload,
        { headers, tags: { step: 'reservation' } }
      );

      check(reservationResponse, {
        'reservation created': (r) => r.status === 201,
        'reservation latency < 400ms': (r) => r.timings.duration < 400,
        'has reference number': (r) => JSON.parse(r.body).reference_number,
      });

      sleep(1);
    });

    // Step 5: Unlock table (cleanup)
    group('Booking - Unlock Table', function () {
      const unlockResponse = http.post(
        `${BASE_URL}/api/v1/tables/${TABLE_ID}/unlock`,
        '{}',
        { headers }
      );

      check(unlockResponse, {
        'unlock successful': (r) => r.status === 200,
      });
    });
  });
}
```

### Script 4: Stress Test (Spike Testing)

```javascript
// File: scripts/stress-test-spike.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const BRANCH_ID = 'branch-1';

// Spike from 10 to 200 users instantly, then back down
export const options = {
  stages: [
    { duration: '2m', target: 10 },    // Ramp-up to 10 users
    { duration: '30s', target: 200 },  // Spike to 200 users
    { duration: '2m', target: 200 },   // Stay at 200 for 2 minutes
    { duration: '30s', target: 10 },   // Drop back to 10
    { duration: '1m', target: 0 },     // Ramp-down to 0
  ],
  thresholds: {
    http_req_duration: ['p(99)<500'],  // More lenient during spike
    http_req_failed: ['rate<0.05'],    // Allow 5% failures during spike
  },
};

export default function () {
  const url = `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=2026-04-25`;
  const response = http.get(url);

  check(response, {
    'status ok': (r) => r.status === 200,
    'response time reasonable': (r) => r.timings.duration < 1000,
  });

  sleep(Math.random() * 2);
}
```

### Script 5: Endurance Test (24-hour sustained load)

```javascript
// File: scripts/endurance-test-24h.js
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const BRANCH_ID = 'branch-1';

export const options = {
  vus: 20,
  duration: '1h',  // In production: '24h'
  thresholds: {
    http_req_duration: ['p(95)<150'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  // Simulate user activity pattern
  const hour = new Date().getHours();
  
  // Peak hours (18:00-22:00): more requests
  const requestsPerCycle = (hour >= 18 && hour < 22) ? 10 : 5;

  for (let i = 0; i < requestsPerCycle; i++) {
    const url = `${BASE_URL}/api/v1/available-slots?branchId=${BRANCH_ID}&date=2026-04-25`;
    const response = http.get(url);

    check(response, {
      'endpoint responding': (r) => r.status === 200,
    });

    sleep(Math.random() * 1);
  }

  // Wait between cycles
  sleep(30);
}
```

---

## Running Performance Tests

### Local Testing

```bash
# Test 1: Available Slots
k6 run --vus 100 --duration 5m scripts/load-test-available-slots.js

# Test 2: Promo Validation
k6 run --vus 100 --duration 10m scripts/load-test-promo-validation.js

# Test 3: Complete Booking
k6 run --vus 30 --duration 5m scripts/load-test-complete-booking.js

# Test 4: Spike Test
k6 run scripts/stress-test-spike.js

# Test 5: Endurance (1 hour)
k6 run scripts/endurance-test-24h.js
```

### With Output to CSV

```bash
k6 run --out csv=results.csv scripts/load-test-available-slots.js
```

### With Custom Environment

```bash
BASE_URL=http://prod.example.com k6 run scripts/load-test-available-slots.js
```

---

## Analyzing Results

### Key Metrics

1. **Response Time**
   - P50 (median): User-friendly
   - P95: Acceptable threshold
   - P99: Maximum
   - Max: Worst case

2. **Error Rate**
   - Total errors / total requests
   - Classes of errors (4xx, 5xx, timeouts)
   - Error rate trend

3. **Throughput**
   - Requests per second (RPS)
   - Failed RPS
   - Maximum sustainable RPS

4. **Resource Usage**
   - CPU usage trend
   - Memory usage trend
   - Connection count trend
   - Database connections

### Interpreting Results

**Good Performance**:
- P95 < 150ms for slots endpoint
- P95 < 100ms for promo validation
- Error rate < 0.1%
- RPS scales linearly with VUs

**Performance Issues**:
- P95 > 500ms indicates bottleneck
- Error rate > 1% suggests resource exhaustion
- Memory growth over time suggests leak
- RPS plateaus below expectations

---

## Optimization Recommendations

### If Available Slots is Slow
1. Add database indices on (branch_id, date)
2. Implement Redis caching for common date ranges
3. Pre-calculate popular slots in background job
4. Use connection pooling

### If Promo Validation is Slow
1. Ensure Redis cache hits > 95%
2. Add TTL to promo code queries
3. Batch validate multiple codes
4. Use async caching updates

### If Reservation Creation is Slow
1. Use database transactions efficiently
2. Defer non-critical operations (logging, metrics)
3. Parallelize independent operations
4. Use connection pooling

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Performance Tests

on: [push, pull_request]

jobs:
  k6_load_test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: postgres
      redis:
        image: redis:7
    steps:
      - uses: actions/checkout@v2
      - uses: grafana/k6-action@v0.3.0
        with:
          filename: scripts/load-test-available-slots.js
          cloud: false
```

---

## Success Criteria

✅ **Available Slots Endpoint**
- [ ] P95 < 150ms
- [ ] P99 < 300ms
- [ ] Error rate < 0.1%
- [ ] Support 1000+ RPS

✅ **Promo Validation**
- [ ] P95 < 100ms (cached)
- [ ] Cache hit rate > 95%
- [ ] Error rate < 0.1%

✅ **Reservation Creation**
- [ ] P95 < 400ms
- [ ] P99 < 750ms
- [ ] Error rate < 0.1%

✅ **System Stability**
- [ ] No memory leaks in 24h test
- [ ] Connection pool recovers after spike
- [ ] No critical errors in error logs

---

**Next Steps**: Execute baseline tests and document results
