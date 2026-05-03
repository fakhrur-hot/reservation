#!/usr/bin/env bash
# =============================================================================
# Sejiwa Booking System — Direct Linux Installation Script
# =============================================================================
# Tested on: Ubuntu 22.04 LTS, Debian 12
# Requirements: sudo access
# Usage: sudo bash install.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

INSTALL_DIR="/opt/sejiwa"
SERVICE_USER="sejiwa"
NODE_VERSION="20"

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   Sejiwa Booking System — Linux Install      ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

[ "$EUID" -ne 0 ] && error "Please run as root: sudo bash install.sh"

# ── Detect OS ─────────────────────────────────────────────────────────────────

. /etc/os-release 2>/dev/null || true
OS_ID="${ID:-unknown}"
info "Detected OS: ${PRETTY_NAME:-$OS_ID}"

# ── Install system dependencies ───────────────────────────────────────────────

info "Updating package lists..."
apt-get update -qq

info "Installing system packages..."
apt-get install -y -qq curl gnupg2 ca-certificates lsb-release \
  postgresql-15 redis-server nginx openssl

# ── Install Node.js ───────────────────────────────────────────────────────────

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v)" != v${NODE_VERSION}* ]]; then
  info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt-get install -y nodejs
fi
success "Node.js $(node -v) ready"

# ── Create system user ────────────────────────────────────────────────────────

if ! id "$SERVICE_USER" &>/dev/null; then
  useradd --system --shell /bin/false --home "$INSTALL_DIR" --create-home "$SERVICE_USER"
  success "Created system user: $SERVICE_USER"
fi

# ── Install application ───────────────────────────────────────────────────────

info "Installing application to $INSTALL_DIR..."
mkdir -p "$INSTALL_DIR"
cp -r . "$INSTALL_DIR/"
chown -R "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR"

cd "$INSTALL_DIR"

info "Installing Node.js dependencies..."
sudo -u "$SERVICE_USER" npm ci --omit=dev

info "Building TypeScript..."
sudo -u "$SERVICE_USER" npm run build

info "Building admin dashboard..."
cd client/admin-dashboard
sudo -u "$SERVICE_USER" npm ci
sudo -u "$SERVICE_USER" npm run build
cd "$INSTALL_DIR"

info "Building client portal..."
cd client/client-portal
sudo -u "$SERVICE_USER" npm ci
sudo -u "$SERVICE_USER" npm run build
cd "$INSTALL_DIR"

# ── Configure PostgreSQL ──────────────────────────────────────────────────────

info "Configuring PostgreSQL..."
DB_NAME="sejiwa_booking"
DB_USER="sejiwa"
DB_PASSWORD=$(openssl rand -hex 16)

systemctl enable postgresql
systemctl start postgresql

sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || \
  sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" 2>/dev/null || true
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true

success "PostgreSQL configured (db: $DB_NAME, user: $DB_USER)"

# ── Configure Redis ───────────────────────────────────────────────────────────

info "Configuring Redis..."
systemctl enable redis-server
systemctl start redis-server
success "Redis started"

# ── Generate .env ─────────────────────────────────────────────────────────────

info "Generating .env..."
JWT_SECRET=$(openssl rand -hex 32)
PORT=3001

cat > "$INSTALL_DIR/.env" <<EOF
NODE_ENV=production
PORT=${PORT}
HOST=0.0.0.0
LOG_LEVEL=info

DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}

REDIS_URL=redis://localhost:6379

JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=15m
REFRESH_TOKEN_EXPIRY=7d

# Fill in SMTP settings to enable email notifications
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

SENTRY_DSN=
EOF

chown "$SERVICE_USER:$SERVICE_USER" "$INSTALL_DIR/.env"
chmod 600 "$INSTALL_DIR/.env"
success ".env created"

# ── Configure nginx ───────────────────────────────────────────────────────────

info "Configuring nginx reverse proxy..."
cat > /etc/nginx/sites-available/sejiwa <<NGINX
server {
    listen 80;
    server_name _;

    # Admin dashboard (React SPA)
    location / {
        root ${INSTALL_DIR}/client/admin-dashboard/dist;
        try_files \$uri \$uri/ /index.html;
    }

    # Client portal
    location /portal/ {
        alias ${INSTALL_DIR}/client/client-portal/dist/;
        try_files \$uri \$uri/ /portal/index.html;
    }

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_cache_bypass \$http_upgrade;
    }

    # Auth + setup routes
    location ~ ^/(auth|setup|health)/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host \$host;
        proxy_read_timeout 86400;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/sejiwa /etc/nginx/sites-enabled/sejiwa
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable nginx
systemctl restart nginx
success "nginx configured"

# ── Create systemd service ────────────────────────────────────────────────────

info "Creating systemd service..."
cat > /etc/systemd/system/sejiwa.service <<SYSTEMD
[Unit]
Description=Sejiwa Booking System API
After=network.target postgresql.service redis-server.service
Requires=postgresql.service redis-server.service

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=sejiwa

[Install]
WantedBy=multi-user.target
SYSTEMD

systemctl daemon-reload
systemctl enable sejiwa
systemctl start sejiwa
success "systemd service created and started"

# ── Wait for health ───────────────────────────────────────────────────────────

info "Waiting for API to be ready..."
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    success "API is healthy"
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "API did not start. Check logs: journalctl -u sejiwa -n 50"
  fi
  sleep 2
done

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   Installation complete!                     ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║   Admin Dashboard  →  http://$(hostname -I | awk '{print $1}')  ║"
echo "  ║   Health check     →  http://localhost:${PORT}/health ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║   Manage service:                            ║"
echo "  ║     systemctl status sejiwa                  ║"
echo "  ║     journalctl -u sejiwa -f                  ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  Next step: open the URL above and complete the setup wizard."
echo ""
