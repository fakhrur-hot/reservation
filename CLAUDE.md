# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SEJIWA Titiwangsa Table Booking System** is a fully operational reservation and table management system for SEJIWA Titiwangsa, a premium cafe in Kuala Lumpur, Malaysia. Built on the **Stage 1 Table Booking Core** framework, it's a monolithic Node.js/TypeScript application using Fastify, PostgreSQL, and Redis, with three separate frontend applications (Sneat Dashboard, Kitchen Portal, Sejiwa Portal).

### SEJIWA Titiwangsa Details
- **Location:** Lot 123, Jalan Titiwangsa, 50400 Kuala Lumpur
- **Contact:** +60 3-4101 0101 | info@sejiwa.my
- **Operation:** TABLE_ONLY mode (table-based reservations)
- **Sections:** 5 dining areas (Main Hall, Private Room, Garden Lounge, VIP Booth, Lounge Bar)
- **Capacity:** 180+ seats across all sections

**Key Technologies:**
- **Runtime:** Node.js 18+, TypeScript 5.3+
- **Framework:** Fastify 4 (HTTP API), WebSockets (ws)
- **Database:** PostgreSQL 15+ with 28 idempotent migrations
- **Cache/Locking:** Redis 7+ (table locking, WebSocket fan-out)
- **Auth:** JWT with HTTP-only refresh token cookies
- **Testing:** Vitest with coverage reporting

---

## Essential Commands

### Development
```bash
npm run dev          # Start with tsx watch + hot reload (port 3001)
npm run build        # TypeScript compilation to ./dist
npm start            # Run compiled dist/index.js
npm run lint         # ESLint on src/ with TypeScript rules
```

### Testing
```bash
npm run test         # Watch mode (includes setup wizard tests)
npm run test:run     # Single run (CI mode)
npm run test:ui      # Vitest UI (useful for debugging failing tests)
npm run test:smoke   # Schema validation smoke tests
npm run test:validation  # Validation-specific tests (vitest.validation.config.ts)
```

### Database & Data
```bash
npm run migrate           # Manually run all pending migrations
npm run db:reset          # Drop and recreate database, rerun migrations/seeds
npm run db:reset:docker   # Same but using docker-compose (PostgreSQL + Redis)
npm run db:recover        # Recover database without seeding dummy data
npm run verify-seeds      # Validate that all required seed data was inserted
npm run seed:reservations # Generate random test reservations for manual testing
```

### Client Development
```bash
npm run client:dashboard  # Start Sneat Dashboard (React, port ~5173)
npm run client:portal     # Start Kitchen Portal (React, port ~5174)
```

---

## Architectural Overview

### Request Pipeline & Middleware Order

The application uses a strict middleware pipeline. Routes are protected by multiple layers in this order:

1. **Health Routes** (`/health/*`) – No auth, no guards
2. **Auth Routes** (`/auth/*`) – No guards (login, register, OTP, identity verification)
3. **Setup Routes** (`/setup/*`) – No branch context (setup wizard endpoints)
4. **Setup Guard Middleware** – Blocks all other routes until `setup_complete = true` in database
5. **Multi-Branch Middleware** – Resolves `branch_id` from JWT or X-Branch-ID header, injects into request
6. **RBAC Middleware** – Enforces role-based access control (Admin, Manager, Waiter)
7. **Operating Mode Guard** – Validates route is allowed in current operating mode (e.g., TABLE_ONLY)
8. **Feature Routes** – Protected endpoints (tables, reservations, orders, etc.)

Each middleware explicitly skips health, auth, and setup routes. **This ordering is critical**—if you add new middleware, insert it at the appropriate level with proper skip conditions.

### Request Object Extensions

Middleware injects these into Fastify request:

```typescript
request.branch_id         // UUID of the branch (from JWT or header)
request.user_id           // UUID of authenticated user
request.user              // User object { id, role, email, branch_id }
request.role              // Role enum (Admin, Manager, Waiter, Customer)
request.transaction       // Optional PoolClient for manual transaction control
```

### Fastify Configuration

- **HTTP Server Sharing:** A raw Node `http.createServer()` is created first, then both Fastify and WebSocket gateway attach to it. The `upgrade` event is manually wired to the WS gateway.
- **Logging:** Pino logger with automatic `branch_id` and `request_id` context injection (development: pretty-printed, production: JSON).
- **Cookie Plugin:** `@fastify/cookie` for HTTP-only refresh token cookies.
- **Error Tracking:** Sentry integration (if `SENTRY_DSN` is set).

---

## Database & Migrations

### Migration System

Migrations live in `src/migrations/` and are **idempotent**. They run automatically on app startup:

1. `MigrationRunner` reads all `.sql` files from migrations folder (numeric order: 001–028)
2. Checks `migrations` table to see which have already been applied
3. Runs only pending migrations in a single transaction per migration
4. Records completion timestamp in `migrations` table

**Adding a new migration:**
1. Create `src/migrations/NNN_description.sql` (e.g., `029_add_field.sql`)
2. Write idempotent SQL (use `IF NOT EXISTS`, check constraints, etc.)
3. Test with `npm run db:reset` to verify the migration chain works

### Database Schema

Core entities (see `SCHEMA_REFERENCE.md` for full table list):

- **branches** – Restaurant locations, settings (deposit amount, timezone, currency, no-show grace period)
- **sections** – Dining areas within a branch (Indoor, Outdoor, Private Room, etc.)
- **tables** – Individual tables with capacity, accessibility features, window view flags
- **customers** – Guest/customer records with phone, email, loyalty info
- **reservations** – Core booking records with status (confirmed, seated, closed, cancelled, no_show), deposit tracking, occasion/decoration fields
- **orders** – Order items for table service (pre-order, add-on)
- **reservations_audit** – Immutable audit log for all reservation changes (status, deputy, timestamp, action type)
- **staff_accounts** – Team members (Admin, Manager, Waiter) with password (Argon2)
- **operating_modes** – System-wide modes (TABLE_ONLY, DINE_IN_PLUS, etc.)
- **roles** – RBAC roles and permissions

See `SCHEMA_REFERENCE.md` for complete column descriptions, constraints, and indexes.

### Seeding

Three-layer seed system runs on startup (only in `development`/`test` mode for dummy layer):

1. **System Seed** – Inserts default roles (Admin, Manager, Waiter), operating modes, currencies (once only)
2. **Default Seed** – Inserts placeholder branch, default admin account (once only)
3. **Dummy Seed** – Generates fake customers, reservations, staff (only in dev/test, clears on reset)

Seed files are in `src/seeds/` with data definitions in `src/seeds/data/`. Seeds use the pattern:
```typescript
export const seedSystemDefaults = async (pool: Pool) => { /* insert if not exists */ }
```

---

## Services & Business Logic

Services are in `src/services/` and use a **static-method pattern** (no class instantiation). They accept a `Pool` or `PoolClient` as their first argument and handle business logic with clean separation of concerns.

### Key Services

| Service | Purpose |
|---------|---------|
| **ReservationService** | Create, read, list reservations; reference number generation; integrates with table locking, deposits, commissions, audit |
| **TableLockService** | Acquire/release Redis-backed locks on tables for booking flow (prevents double-booking) |
| **BusinessHoursService** | Validate reservation times against branch operating hours, lead time, cutoff times; handle overrides |
| **DepositService** | Calculate, record, process, refund booking deposits; ledger tracking |
| **CommissionService** | Calculate staff commissions from reservations (tiered, percentage-based) |
| **AuthService** | JWT generation/verification, password hashing (Argon2), role extraction |
| **OtpService** | Generate, verify, expire OTP for customer identity verification |
| **NotificationService** | Send email notifications (reservations, reminders, no-show) via SMTP |
| **NotificationAlertService** | Real-time WebSocket alerts for staff/admin (new bookings, cancellations, no-shows, upcoming seats) with customizable settings |
| **SchedulerService** | Background cron jobs (no-show detection, reminder emails) using node-cron |
| **AuditService** | Log all sensitive actions (reservation changes, refunds, staff edits) to audit table |
| **PromoCodeService** | CRUD and validation of promotional codes (discount %, applicable to reservations) |
| **OrderService** | Pre-order and add-on order management for table service |
| **WebSocketPublisher** | Publish real-time events to connected clients (table availability, reservation updates, staff notifications) |
| **SerialKeyService** | Unlock/lock operating modes (admin feature for staged rollouts) |

### Service Integration Pattern

Services integrate via dependency injection in route handlers:
```typescript
const reservation = await ReservationService.createReservation(pool, {
  customer_id, table_id, reservation_time, party_size, ...
});
const deposit = await DepositService.processDeposit(pool, reservation.id, amount);
```

Some services trigger WebSocket events for real-time updates (e.g., table locks, reservation status changes). Look for `WebSocketPublisher.publish(...)` calls.

---

## Multi-Tenancy & RBAC

### Multi-Branch Architecture

The system supports multiple independent branches per installation:

- **Branch Isolation:** All queries filter by `branch_id` (enforced in middleware, not in routes)
- **Branch Resolution:** Decoded from JWT `branch_id` claim or from `X-Branch-ID` header (fallback)
- **Setup Wizard:** Branch-scoped; each branch needs its own admin account, hours, tables, sections
- **Data Segregation:** Foreign keys enforce `branch_id` matching; no cross-branch queries possible

When adding a new route that interacts with branch data, ensure queries always include a `WHERE branch_id = $X` filter.

### RBAC (Role-Based Access Control)

Three built-in roles with increasing privilege:

- **Waiter** – Can list tables, create orders, mark reservations as seated/closed
- **Manager** – Waiter + can manage staff accounts, view reports, handle deposits/refunds
- **Admin** – Everything; can configure branch, hours, tables, sections, operating modes

RBAC is enforced at route level:
```typescript
// Check role in route handler
if (request.role !== 'Admin') {
  throw new UnauthorizedError('Admin role required');
}
```

Some routes are public (customer-facing): `/auth/*`, `/setup/*`, table booking flows (via table-lock), promo code validation.

---

## Setup System

The setup wizard is a gated flow that must complete before the app can be used:

1. **Setup Guard Middleware** – Blocks all routes (except health, auth, setup) until `branches.setup_complete = true`
2. **Setup Routes** (`/setup/*`) – Endpoints to progressively configure the branch
3. **Setup Wizard UI** – Sneat Dashboard renders an 8-step form that calls setup endpoints
4. **Progress Persistence** – State saved in `localStorage` (client) and database (server)

Endpoints in `src/routes/setup.routes.ts`:

```typescript
POST /setup/restaurant-profile   // Branch name, code, address, timezone, currency
POST /setup/operating-hours      // Daily schedule + cutoff times
POST /setup/sections-tables      // Create dining areas and tables
POST /setup/admin-account        // Create first admin user
POST /setup/manager-account      // Create first manager
POST /setup/email-settings       // Configure SMTP
POST /setup/deposit-settings     // Set deposit amount, refund policy
POST /setup/confirm              // Mark setup_complete = true
```

Each step validates input and returns structured errors. The UI polls or reads from a `GET /setup/status` endpoint to know which steps are complete.

---

## Testing Strategy

### Test Structure

- **Unit Tests:** Service logic, utility functions; use Vitest globals (`describe`, `test`, `expect`)
- **Integration Tests:** Route handlers + middleware; use test database
- **Test Files:** Colocated with source (e.g., `reservation.service.test.ts` next to `reservation.service.ts`)
- **Test Database:** Uses a separate PostgreSQL instance (from `.env.test` or environment)

### Running Specific Tests

```bash
# Single test file
npm run test:run -- src/services/reservation.service.test.ts

# Pattern matching (e.g., all "booking" tests)
npm run test:run -- booking

# With coverage report
npm run test:run -- --coverage
```

### Test Patterns

Routes typically mock the database and test request/response:
```typescript
test('POST /reservations creates reservation', async () => {
  const res = await request
    .post('/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({ customer_id, table_id, reservation_time, party_size: 4 });
  
  expect(res.status).toBe(201);
  expect(res.body.id).toBeDefined();
});
```

Services test database state changes:
```typescript
test('ReservationService.createReservation inserts row', async () => {
  const reservation = await ReservationService.createReservation(pool, {
    customer_id: 'cust-123', table_id: 'tbl-456', ...
  });
  
  const row = await pool.query('SELECT * FROM reservations WHERE id = $1', [reservation.id]);
  expect(row.rows).toHaveLength(1);
});
```

**Coverage exclusions** (in vitest.config.ts):
- Migrations (SQL, not TypeScript logic)
- Seeds (test-data only)
- Test files themselves

Target: 80%+ coverage on services and routes.

---

## Real-Time Features (WebSocket)

### WebSocket Gateway

Initialized in `src/index.ts`:
```typescript
const wsGateway = initializeWebSocketGateway(httpServer);
```

The gateway listens on the same `httpServer` as Fastify, manually handling HTTP upgrade events.

### Publishing Events

Services trigger real-time updates via `WebSocketPublisher.publish()`:
```typescript
await WebSocketPublisher.publish('table-lock', {
  branch_id,
  table_id,
  locked_until: new Date(),
});
```

### Connected Clients

The Sneat Dashboard and Kitchen Portal subscribe to events relevant to their branch (resolved via JWT or connection headers). Events are namespaced by `branch_id` to prevent cross-branch visibility.

### Notification Alerts (Real-Time)

`NotificationAlertService` publishes real-time alerts to connected staff/admin clients via WebSocket. Alert types and settings are configurable per branch:

```typescript
// Publish an alert (checks if enabled first)
await NotificationAlertService.publishAlert(pool, {
  type: 'reservation_created',
  branchId,
  reservation: {
    id, referenceNumber, customerName, customerEmail, customerPhone,
    reservationTime, partySize, sectionName, tableName, tableId,
    hasDecoration, decorationType, decorationColor, cakeChoice
  },
});
```

Alert types: `reservation_created`, `reservation_cancelled`, `reservation_no_show`, `reservation_upcoming_15min` (customizable lead time).

Admins configure alert settings via `PATCH /api/admin/v1/branches/:id/notification-alerts/settings`. Settings stored in `branches.notification_alert_settings` (JSONB).

See `.kiro/NOTIFICATION_ALERT_IMPLEMENTATION.md` for complete integration guide.

---

## Common Development Patterns

### Transaction Handling

For multi-step operations (e.g., create reservation + record deposit + publish event):

```typescript
const client = await pool.connect();
try {
  await client.query('BEGIN');
  
  const reservation = await ReservationService.createReservation(client, { ... });
  const deposit = await DepositService.processDeposit(client, reservation.id, amount);
  
  await client.query('COMMIT');
  
  // Publish after commit succeeds
  await WebSocketPublisher.publish('reservation-created', { reservation_id: reservation.id });
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}
```

Use `transaction()` helper from `src/config/database.ts` to simplify:
```typescript
await transaction(pool, async (client) => {
  // all queries here are in one transaction
  const res = await ReservationService.createReservation(client, { ... });
  return res;
});
```

### Error Handling

Use structured error classes from types:
```typescript
throw new BadRequestError('Invalid reservation time');
throw new UnauthorizedError('Admin role required');
throw new NotFoundError('Table not found');
```

These are caught by Fastify's error handler and return JSON with `code`, `message`, `statusCode`.

### Logging

Use the global `logger` from `src/config/logger.ts`:
```typescript
logger.info('Creating reservation', { customer_id, table_id });
logger.error(error, 'Failed to process deposit');
logger.debug('Table lock acquired', { table_id, locked_until });
```

Log level is configurable via `LOG_LEVEL` env var (default: `info`). In development, output is pretty-printed; in production, JSON.

### Audit Logging

For sensitive actions (reservation changes, deposits, staff edits), call `AuditService`:
```typescript
await AuditService.log(pool, {
  branch_id,
  action_type: 'RESERVATION_CANCELLED',
  entity_id: reservation_id,
  deputy_id: staff_id,
  old_state: { status: 'confirmed' },
  new_state: { status: 'cancelled' },
  details: { reason: 'Customer requested' },
});
```

Audit records are immutable and queryable via `/audit` endpoints (Admin only).

---

## Environment Variables

### Required
- `DATABASE_URL` – PostgreSQL connection (e.g., `postgresql://user:pass@localhost:5432/tablebook`)
- `REDIS_URL` – Redis connection (e.g., `redis://localhost:6379`)
- `JWT_SECRET` – Signing key for JWTs (≥32 chars)

### Optional
- `NODE_ENV` – `development`, `test`, or `production` (default: `development`)
- `PORT` – API port (default: 3001)
- `HOST` – Bind address (default: `0.0.0.0`)
- `LOG_LEVEL` – Pino log level (default: `info`)
- `SENTRY_DSN` – Sentry error tracking endpoint
- `SMTP_*` – Email config (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL, SMTP_FROM_NAME)

See `.env.example` for all options.

---

## Frontend Applications

Three separate React applications in `client/`:

1. **sneat-dashboard** – Customer-facing booking interface + admin setup wizard
2. **qitchen-portal** – Staff kitchen/service dashboard (real-time order updates)
3. **sejiwa-portal** – Manager/admin portal (reports, staff management, settings)

Each has its own `package.json`, build, and dev server. They communicate with the API via HTTP (REST + occasional WebSocket) and share type definitions via `client/SHARED_TYPES.ts`.

To develop:
```bash
npm run client:dashboard   # Terminal 1
npm run client:portal      # Terminal 2 (optional)
npm run dev                # Terminal 3: API server
```

---

## Deployment & Docker

### Local Development with Docker

```bash
docker-compose up -d      # Start PostgreSQL 15 + Redis 7
npm install
npm run dev
```

Docker Compose file: `docker-compose.yml` (PostgreSQL on 5432, Redis on 6379).

### Building for Production

```bash
npm run build              # Compile TypeScript → ./dist
npm run start              # Run dist/index.js
```

See `docs/deployment.md` for cloud deployment guidance (environment-specific configs, scaling considerations, health check endpoints).

---

## Code Style & Linting

ESLint config in `.eslintrc.json`:
- Parser: `@typescript-eslint/parser`
- Extends: `eslint:recommended` + `@typescript-eslint/recommended`
- Warnings: `no-explicit-any`, no explicit return types, console usage

Run before commit:
```bash
npm run lint
```

Auto-fix (if possible):
```bash
npx eslint src --fix
```

**Type Safety:** TypeScript strict mode enabled (`"strict": true` in tsconfig.json). All functions should have explicit return types; no implicit `any`.

---

## Useful Files & References

| File | Purpose |
|------|---------|
| `SCHEMA_REFERENCE.md` | Complete database schema, all tables & columns |
| `README.md` | Quick start, feature list, environment setup |
| `src/types/` | Shared TypeScript types and interfaces |
| `src/utils/` | Utility functions (validation, formatting, helpers) |
| `src/migrations/001_schema.sql` | Initial schema (starting point to understand data model) |
| `docs/deployment.md` | Production deployment, scaling, health checks |

---

## Key Architectural Decisions

1. **Monolithic API** – Single Fastify app handles all routes (tables, reservations, orders, admin, etc.). No microservices complexity.
2. **Redis for Table Locking** – Distributed table locks prevent double-booking across instances.
3. **Webhook Events** – Services publish events for real-time updates; WebSocket gateway fans out to connected clients.
4. **Branch-Scoped Seeding** – Each branch can have its own seed data; system seeds are global.
5. **Idempotent Migrations** – Migrations can be safely re-run; they check existence before creating.
6. **HTTP-Only Cookies** – Refresh tokens stored in secure, HTTP-only cookies; access tokens in Authorization header.
7. **Setup Guard Middleware** – Blocks API until initial setup is complete; ensures every branch is configured.
8. **Audit Logging** – Immutable ledger for compliance; all sensitive changes recorded with deputy, timestamp, and old/new state.

---

## Common Debugging Tips

- **Check branch_id routing:** Add `logger.debug({ branch_id: request.branch_id }, 'Branch context')` to middleware to verify branch resolution.
- **Verify migrations:** `npm run verify-seeds` checks that all expected seed data is present.
- **Test a single service:** `npm run test:run -- src/services/reservation.service.test.ts`
- **Database state:** Connect with `psql postgresql://user:pass@localhost/tablebook` and query directly.
- **WebSocket events:** Subscribe to a channel in `test/websocket-client.js` and print received events.
- **Logs with context:** Use `logger.info({ request_id, branch_id }, 'Message')` to trace requests across middleware.

---

## Next Steps for Future Work

When implementing new features:

1. Define the database schema (or modify existing tables via new migration)
2. Create a service layer in `src/services/` with business logic
3. Add routes in `src/routes/` that call the service (with proper middleware guards)
4. Add tests for both service and route
5. Update `SCHEMA_REFERENCE.md` if schema changed
6. Ensure RBAC middleware guards the route (check `request.role`)
7. Publish WebSocket events if the feature affects real-time dashboards
8. Document in `CLAUDE.md` if adding new services or middleware

---

**Last Updated:** April 2026

