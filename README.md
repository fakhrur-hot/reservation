# SEJIWA Titiwangsa Cafe - Reservation System

A fully operational table reservation and management system for SEJIWA Titiwangsa, a premium cafe in Kuala Lumpur, Malaysia. Built on the **Stage 1 Table Booking Core** framework, the system is pre-configured with SEJIWA's cafe information and ready to use immediately upon setup.

## 🏪 Pre-Configured for SEJIWA Titiwangsa

**This system comes pre-filled with:**
- ✅ SEJIWA Titiwangsa cafe details (name, address, phone, email)
- ✅ 5 dining sections (Main Hall, Private Room, Garden Lounge, VIP Booth, Lounge Bar)
- ✅ 40+ tables with proper capacity and seating features
- ✅ Staff accounts (Admin, Manager, 5 Waiters)
- ✅ 15 sample customers for testing
- ✅ Default financial settings (RM 100 deposit, RM 150 decoration fee)
- ✅ Operating hours and closure policies
- ✅ Real-time notification alert system
- ✅ All database migrations and seeds

**No setup wizard needed** — the system is ready to use immediately after database initialization.

## Quick Start

### Prerequisites

- **Node.js** 18 or higher
- **PostgreSQL** 15 or higher
- **Redis** 7 or higher

### Installation

1. Clone the repository and install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
```

3. Start all three services (each in its own terminal):

**Terminal 1 — API Server**
```bash
npm run dev
```
The API will automatically run all migrations, apply seed data, and start on port 3001.

**Terminal 2 — Admin Dashboard**
```bash
npm run client:dashboard
```

**Terminal 3 — Client Portal**
```bash
npm run client:portal
```

All three services must be running for the system to work:

| Service | URL | Purpose |
|---|---|---|
| API Server | http://localhost:3001 | Backend REST API + WebSocket |
| Admin Dashboard | http://localhost:5173 | Staff / manager / admin portal |
| Client Portal | http://localhost:5174 | Customer-facing booking interface |

The API automatically:
- Runs all migrations on a fresh database
- Seeds SEJIWA Titiwangsa cafe configuration (sections, tables, staff accounts)
- **Setup is complete** — no wizard needed!

### Environment Variables

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql://user:password@localhost:5432/tablebook`)
- `REDIS_URL` - Redis connection string (e.g., `redis://localhost:6379`)
- `JWT_SECRET` - Secret key for JWT signing (minimum 32 characters)
- `PORT` - API server port (default: 3001)

**Optional:**
- `NODE_ENV` - Environment mode (`development`, `test`, `production`; default: `development`)
- `SENTRY_DSN` - Sentry error tracking DSN
- `LOG_LEVEL` - Pino log level (default: `info`)

**SMTP Configuration** (for email notifications):
- `SMTP_HOST` - SMTP server hostname
- `SMTP_PORT` - SMTP server port (typically 587 or 465)
- `SMTP_USER` - SMTP username
- `SMTP_PASSWORD` - SMTP password
- `SMTP_FROM_NAME` - Display name for outbound emails
- `SMTP_FROM_EMAIL` - From email address

### Migration and Seeding

Migrations and seeds run automatically on application startup:

1. **Consolidated Migration** (`001_initial_schema.sql`): Applied first to set up the full database structure (all tables, indexes, and constraints).
2. **Initial Seeds** (`002_initial_seeds.sql`): Applied next to populate baseline system data (roles, modes, currencies).
3. **Branch Setup**: Use the Admin Portal to complete branch-specific configuration.
4. **Dummy Data**: Generates fake customers and reservations (only in `development` or `test` mode).

To manually run migrations:
```bash
npm run migrate
```

To verify seed data:
```bash
npm run verify-seeds
```

### Development

```bash
npm run dev          # Start with hot reload
npm run build        # Build for production
npm run test         # Run tests in watch mode
npm run test:run     # Run tests once
npm run lint         # Check code style
```

### Docker Compose

For local development with PostgreSQL and Redis:

```bash
docker-compose up -d
npm run dev
```

See `docs/deployment.md` for production deployment instructions.

## Setup Wizard

The setup wizard (8 steps) runs automatically on first access:

1. **Restaurant Profile** - Name, branch code, address, timezone, currency
2. **Operating Hours** - Daily schedule with cutoff times
3. **Sections & Tables** - Define dining areas and table layout
4. **Admin Account** - Create the first admin user
5. **Manager Account** - Add at least one manager
6. **Email Settings** - Configure SMTP (optional, can skip)
7. **Deposit Settings** - Set booking deposit amount and refund tiers
8. **Review & Confirm** - Verify all settings and complete setup

Progress is auto-saved to `localStorage` and server-side, so the operator can resume from any device.

## Project Structure

```
src/
├── config/           # Configuration modules (database, redis, logger)
├── db/               # Database initialization
├── middleware/       # Express middleware (setup guard, RBAC, etc.)
├── migrations/       # SQL migration files (001–028)
├── routes/           # API route handlers
├── seeds/            # Seed data and runners
│   └── data/         # Typed seed data files
├── services/         # Business logic services
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── index.ts          # Application entry point
```

## Architecture

- **Monolithic Node.js/TypeScript API** - Single deployable unit with clean module boundaries
- **PostgreSQL** - Persistent data storage with 28 idempotent migrations
- **Redis** - Distributed table locking and WebSocket event fan-out
- **Setup Guard Middleware** - Blocks all routes until initial configuration is complete
- **Structured Seeding** - Three-layer seed system (system, default, dummy)

## Features (Stage 1 - TABLE_ONLY)

- First-run setup wizard with progress persistence
- Customer identity verification and authentication
- Table selection and concurrent locking
- Reservation confirmation and management
- Real-time staff dashboard via WebSocket
- Automated no-show detection
- Booking deposit collection (configurable)
- Thermal printer integration (ESC/POS)
- Email notifications and reminders
- Role-based access control (Admin, Manager, Waiter)
- Multi-branch isolation
- Comprehensive audit logging

## Logging

The application uses Pino for structured logging:
- JSON format in production, pretty-printed in development
- Automatic `branch_id` and `request_id` context injection
- Configurable log level via `LOG_LEVEL` environment variable

## Error Tracking

Sentry integration captures:
- Unhandled exceptions
- Unhandled promise rejections
- Critical errors from background jobs

Configure `SENTRY_DSN` to enable.

## Testing

```bash
npm run test         # Watch mode
npm run test:run     # Single run
npm run test:ui      # Vitest UI
```

## License

MIT
