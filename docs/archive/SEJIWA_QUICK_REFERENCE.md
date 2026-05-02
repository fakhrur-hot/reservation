# SEJIWA Titiwangsa - Quick Reference Card

## 🚀 Quick Start (2 minutes)

```bash
# 1. Install dependencies
npm install

# 2. Copy environment config
cp .env.example .env

# 3. Reset database & seed SEJIWA data
npm run db:reset

# 4. Start development server
npm run dev
```

✅ **Done!** System is ready. Sections, tables, and staff accounts are all pre-configured.

---

## 📍 Cafe Details

| Item | Value |
|------|-------|
| **Name** | SEJIWA Titiwangsa |
| **Branch Code** | SEJW-KL01 |
| **Address** | Lot 123, Jalan Titiwangsa, 50400 KL |
| **Phone** | +60 3-4101 0101 |
| **Email** | info@sejiwa.my |
| **Currency** | MYR (Malaysian Ringgit) |
| **Timezone** | Asia/Kuala_Lumpur |

---

## 🗓️ Operating Hours

| Day | Hours |
|-----|-------|
| Monday - Friday | 11:00 AM - 11:00 PM |
| Saturday | 10:00 AM - 12:00 AM (Midnight) |
| Sunday | 10:00 AM - 11:00 PM |

---

## 👥 Default Staff Accounts

### Admin Account
```
Email:    admin@sejiwa.my
Password: TempPassword123!
Role:     Admin (Full System Access)
```

### Manager Account
```
Email:    manager@sejiwa.my
Password: TempPassword123!
Role:     Manager (Daily Operations)
```

### Waiter Accounts (5)
```
Email:    waiter1@sejiwa.my through waiter5@sejiwa.my
Password: TempPassword123!
Role:     Waiter (Table Service)
```

⚠️ **Change all temporary passwords on first login!**

---

## 🏪 Dining Sections & Tables

| Section | Capacity | Tables | Features |
|---------|----------|--------|----------|
| **Main Hall** | 60 | 20 | Open layout, casual dining |
| **Private Room** | 30 | 3 | Intimate, special occasions |
| **Garden Lounge** | 40 | 8 | Outdoor, scenic views |
| **VIP Booth** | 12 | 3 | Premium seating, lounge |
| **Lounge Bar** | 25 | 5 | Bar counter, casual lounge |
| **TOTAL** | **180+** | **40+** | Mixed capacity options |

---

## 💳 Financial Settings

```
Booking Deposit Amount:    RM 100
Decoration Package Fee:    RM 150
No-Show Grace Period:      15 minutes
Cancellation Cutoff:       24 hours before
Modification Cutoff:       24 hours before
```

---

## 🔔 Real-Time Notifications

**Alert Types (All Enabled by Default):**
- 🎉 New Bookings
- ❌ Cancellations  
- ⏰ No-Shows
- ⌚ Upcoming Seats (15-minute lead time, customizable)

**Configure in:** Sejiwa Portal → Settings → Notification Alerts

---

## 📱 Access Points

| Application | URL | Purpose |
|-------------|-----|---------|
| **Admin Portal** | http://localhost:5173 (via login) | Staff & admin interface |
| **Customer Booking** | http://localhost:5173 | Customer reservations |
| **Kitchen Portal** | http://localhost:5174 | Kitchen order management |
| **API Server** | http://localhost:3001 | Backend API |

---

## 📊 Database Info

```
Database Name:  sejiwa_titiwangsa_db
User:           sejiwa_user
Password:       sejiwa_pass_123
Host:           localhost
Port:           5432
```

**Connection:** `postgresql://sejiwa_user:sejiwa_pass_123@localhost:5432/sejiwa_titiwangsa_db`

---

## 🛠️ Common Commands

```bash
# Development
npm run dev                    # Start with hot reload (port 3001)
npm run build                  # Compile TypeScript
npm run lint                   # Check code quality

# Database
npm run db:reset               # Reset and reseed with SEJIWA data
npm run migrate                # Run pending migrations only
npm run seed:reservations      # Generate test reservations

# Testing
npm run test                   # Run all tests
npm run test:run               # Single test run
npm run test:smoke             # Schema validation tests

# Clients
npm run client:dashboard       # Start customer dashboard (port ~5173)
npm run client:portal          # Start kitchen portal (port ~5174)
```

---

## 🔑 Environment Variables

**Key Settings (in .env):**

```env
# Database
DATABASE_URL=postgresql://sejiwa_user:sejiwa_pass_123@localhost:5432/sejiwa_titiwangsa_db

# Server
NODE_ENV=development
PORT=3001
LOG_LEVEL=info

# Security
JWT_SECRET=sejiwa_titiwangsa_jwt_secret_key_min_32_chars_required_xyz_change_in_prod

# Cafe
CAFE_NAME=SEJIWA Titiwangsa
CAFE_CODE=SEJW-KL01
CAFE_PHONE=+60 3-4101 0101
CAFE_EMAIL=info@sejiwa.my

# Features (All Enabled)
ENABLE_NOTIFICATIONS=true
ENABLE_NOTIFICATION_ALERTS=true
OPERATING_MODE=TABLE_ONLY
```

---

## 📈 Sample Data Included

- ✅ 15 sample customers (Malaysian names & contacts)
- ✅ 40+ pre-configured tables across 5 sections
- ✅ 5 full staff accounts (admin, manager, 5 waiters)
- ✅ Operating hours & policies
- ✅ Financial settings (deposit, decoration fees)
- ✅ Notification alert configuration

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Database connection error | Run `npm run db:reset:docker` to use Docker |
| Port 3001 already in use | Change `PORT` in `.env` or kill process on 3001 |
| Slow startup | Check PostgreSQL is running, migrations take ~10 seconds |
| Notification alerts not showing | Check browser console, ensure WebSocket connected |
| Can't login | Use credentials from Staff Accounts table above |

---

## 📞 Key Contacts

- **Admin Email:** admin@sejiwa.my
- **Cafe Phone:** +60 3-4101 0101
- **Cafe Email:** info@sejiwa.my
- **Operating Hours:** 11am-11pm (see above)

---

## 📚 Documentation

- **SEJIWA_README.md** - Complete system documentation
- **CLAUDE.md** - Development guide & architecture
- **SCHEMA_REFERENCE.md** - Database schema details
- **.env.example** - All environment variables

---

**System Status:** ✅ Ready to Use  
**Version:** 1.0.0  
**Last Updated:** April 2026
