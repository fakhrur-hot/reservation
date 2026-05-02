# SEJIWA Titiwangsa Cafe - Reservation System

Welcome to the SEJIWA Titiwangsa Cafe Table Reservation and Management System. This application is a fully-featured reservation platform designed specifically for SEJIWA Titiwangsa.

## 🏪 Cafe Information

| Field | Value |
|-------|-------|
| **Name** | SEJIWA Titiwangsa |
| **Location** | Lot 123, Jalan Titiwangsa, 50400 Kuala Lumpur, Malaysia |
| **Phone** | +60 3-4101 0101 |
| **Email** | info@sejiwa.my |
| **Operating Hours** | Mon-Fri: 11:00 AM - 11:00 PM<br>Sat: 10:00 AM - 12:00 AM<br>Sun: 10:00 AM - 11:00 PM |
| **Branch Code** | SEJW-KL01 |
| **Operating Mode** | TABLE_ONLY |

## 📍 Dining Sections

SEJIWA Titiwangsa features 5 distinct dining areas:

### 1. Main Hall
- **Capacity:** 60 people
- **Tables:** 20 (2-pax to 8-pax)
- **Features:** Spacious, open layout, casual dining
- **Window Seats:** Available (Tables T3, T6, T9, etc.)

### 2. Private Room
- **Capacity:** 30 people
- **Tables:** 3 (8-pax to 12-pax)
- **Features:** Intimate, perfect for special occasions, private events
- **Layout:** Long table and round tables

### 3. Garden Lounge
- **Capacity:** 40 people
- **Tables:** 8 (4-6 pax each)
- **Features:** Open-air, outdoor ambiance, scenic views
- **Window Seats:** All tables

### 4. VIP Booth
- **Capacity:** 12 people (max 4 people per booth)
- **Tables:** 3 premium booths
- **Features:** Premium seating, exclusive lounge
- **Window Seats:** Some available

### 5. Lounge Bar
- **Capacity:** 25 people
- **Tables:** Bar counter (6 pax) + 4 lounge tables
- **Features:** Casual, bar counter seating, lounge atmosphere
- **Ideal For:** Friends meeting, casual dining

## 💳 Default Financial Settings

```
Currency:              MYR (Malaysian Ringgit)
Booking Deposit:       RM 100
Decoration Package:    RM 150
Timezone:              Asia/Kuala_Lumpur (GMT +8)
```

## ⏱️ Operational Policies

```
No-Show Grace Period:     15 minutes
Cancellation Cutoff:      24 hours before reservation
Modification Cutoff:      24 hours before reservation
Reservation Lead Time:    Available up to 3 months ahead
```

## 👥 Default Staff Accounts

### Admin Account
- **Email:** admin@sejiwa.my
- **Name:** SEJIWA Admin
- **Role:** Admin (full system access)
- **Temporary Password:** TempPassword123!

### Manager Account
- **Email:** manager@sejiwa.my
- **Name:** SEJIWA Manager
- **Role:** Manager (daily operations, reporting)
- **Temporary Password:** TempPassword123!

### Waiter Accounts
- **Emails:** waiter1@sejiwa.my through waiter5@sejiwa.my
- **Role:** Waiter (table service operations)
- **Temporary Password:** TempPassword123!

⚠️ **Important:** Change all temporary passwords on first login!

## 🚀 Getting Started

### 1. Setup Database

```bash
# Reset and seed database with SEJIWA data
npm run db:reset

# Or use Docker
npm run db:reset:docker
```

This will:
- ✅ Create all database tables
- ✅ Initialize SEJIWA Titiwangsa as the default branch
- ✅ Create 5 dining sections with 40+ tables
- ✅ Create staff accounts (admin, manager, 5 waiters)
- ✅ Add 15 sample customers for testing
- ✅ Configure notification alert settings

### 2. Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3001`

### 3. Access Admin Portal

Navigate to the Sejiwa Portal (admin interface):
- **Email:** admin@sejiwa.my
- **Password:** TempPassword123!

### 4. Configure SMTP (Email)

To enable reservation confirmations and reminders, configure SMTP in `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=noreply@sejiwa.my
SMTP_PASSWORD=your_password
SMTP_FROM_EMAIL=noreply@sejiwa.my
SMTP_FROM_NAME=SEJIWA Titiwangsa Cafe
```

## 🔑 Environment Variables

All SEJIWA settings are pre-configured in `.env.example`:

```env
# Database
DATABASE_URL=postgresql://sejiwa_user:sejiwa_pass_123@localhost:5432/sejiwa_titiwangsa_db

# Server
NODE_ENV=development
PORT=3001

# Cafe Settings
CAFE_NAME=SEJIWA Titiwangsa
CAFE_CODE=SEJW-KL01
CAFE_PHONE=+60 3-4101 0101
CAFE_EMAIL=info@sejiwa.my

# Features
ENABLE_NOTIFICATIONS=true
ENABLE_NOTIFICATION_ALERTS=true
OPERATING_MODE=TABLE_ONLY
```

Copy `.env.example` to `.env` and update as needed.

## 📱 Frontend Applications

### 1. Sneat Dashboard (Customer Booking)
```bash
npm run client:dashboard
```
- Customer-facing interface
- Browse tables and make reservations
- View booking history
- Manage decoration preferences

### 2. Kitchen Portal (Order Management)
```bash
npm run client:portal
```
- Kitchen staff interface
- View orders in real-time
- Order tracking and status updates

### 3. Sejiwa Portal (Admin Dashboard)
- Manager/admin interface
- View all reservations
- Manage staff accounts
- Configure branch settings
- View reports and analytics
- Configure notification alerts

## 🔔 Real-Time Features

### Notification Alerts
Staff and admin receive real-time notifications for:
- 🎉 **New Bookings** - When customers make reservations
- ❌ **Cancellations** - When reservations are cancelled
- ⏰ **No-Shows** - When customers don't arrive
- ⌚ **Upcoming Seats** - When parties are arriving (customizable lead time)

Customize alert settings in Sejiwa Portal → Settings → Notification Alerts

### WebSocket Updates
Real-time updates for:
- Table availability changes
- Reservation status updates
- Staff alerts and notifications

## 🧪 Testing

### Run All Tests
```bash
npm run test
```

### Run Smoke Tests (Schema Validation)
```bash
npm run test:smoke
```

### Generate Test Data
Create random reservations for the next 3 days:
```bash
npm run seed:reservations
```

## 📊 Database Schema

Key tables in the SEJIWA database:

```
branches          → SEJIWA Titiwangsa branch info
sections          → 5 dining areas
tables            → 40+ individual tables
reservations      → All bookings and their status
customers         → Guest information
staff             → Admin, manager, waiter accounts
deposit_transactions → Booking deposits
audit_log         → All system changes
```

See `SCHEMA_REFERENCE.md` for complete schema documentation.

## 🔒 Security

- **Authentication:** JWT tokens with secure refresh token cookies
- **Authorization:** Role-based access control (Admin, Manager, Waiter)
- **Encryption:** Passwords hashed with Argon2 (cost factor 12)
- **Audit Trail:** All sensitive changes logged immutably
- **CORS:** Configured for frontend applications
- **Rate Limiting:** Implemented on sensitive endpoints

## 🛠️ Architecture

- **API Framework:** Fastify 4 (HTTP/WebSocket)
- **Database:** PostgreSQL 15+
- **Cache/Locking:** Redis 7+
- **Real-Time:** WebSocket with Redis Pub/Sub
- **Language:** TypeScript 5.3+
- **Testing:** Vitest with coverage reporting

## 📚 Documentation

- **CLAUDE.md** - Development guide and architectural overview
- **SCHEMA_REFERENCE.md** - Complete database schema
- **SEJIWA_TITIWANGSA_SETUP_TEMPLATE.md** - Detailed setup configuration
- **Notification Alert Guides** - Real-time notification system docs

## 🐛 Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution:** Ensure PostgreSQL is running
```bash
npm run db:reset:docker   # Uses Docker Compose
```

### Password Reset
All default staff accounts use `TempPassword123!`

To reset a staff member's password:
1. Admin → Staff Management
2. Select staff member
3. Click "Reset Password"

### Clear Cache
If experiencing stale data:
```bash
redis-cli FLUSHALL
npm run dev
```

## 📞 Support

For issues or questions:
- **Email:** admin@sejiwa.my
- **Phone:** +60 3-4101 0101
- **Hours:** 11:00 AM - 11:00 PM (Mon-Fri)

---

**System Version:** 1.0.0  
**Last Updated:** April 2026  
**Status:** ✅ Production Ready
