#!/usr/bin/env bash
# =============================================================================
# Sejiwa Booking System — Docker Installation Script
# =============================================================================
# Requirements: Docker 24+, Docker Compose v2
# Usage: bash install.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*"; exit 1; }

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   Sejiwa Booking System — Docker Install     ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ── Prerequisite checks ───────────────────────────────────────────────────────

command -v docker  >/dev/null 2>&1 || error "Docker is not installed. Visit https://docs.docker.com/get-docker/"
command -v docker compose version >/dev/null 2>&1 || \
  docker-compose version >/dev/null 2>&1 || \
  error "Docker Compose v2 is not installed."

DOCKER_COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || DOCKER_COMPOSE="docker-compose"

success "Docker and Docker Compose found"

# ── Generate .env if missing ──────────────────────────────────────────────────

if [ ! -f .env ]; then
  info "Generating .env from template..."
  cp .env.example .env

  # Generate a secure JWT secret
  JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 64)
  DB_PASSWORD=$(openssl rand -hex 16 2>/dev/null || cat /dev/urandom | tr -dc 'a-f0-9' | head -c 32)

  sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
  sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=${DB_PASSWORD}|" .env

  success ".env created with generated secrets"
  warn "Review .env and set SMTP_* values before going live"
else
  info ".env already exists — skipping generation"
fi

# ── Pull and start ────────────────────────────────────────────────────────────

info "Pulling latest images..."
$DOCKER_COMPOSE -f docker-compose.prod.yml pull

info "Starting services..."
$DOCKER_COMPOSE -f docker-compose.prod.yml up -d

# ── Wait for health ───────────────────────────────────────────────────────────

info "Waiting for API to be ready..."
PORT=$(grep -E '^PORT=' .env | cut -d= -f2 || echo "3001")
PORT=${PORT:-3001}

for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/health" >/dev/null 2>&1; then
    success "API is healthy on port ${PORT}"
    break
  fi
  if [ "$i" -eq 30 ]; then
    error "API did not become healthy after 30 attempts. Run: $DOCKER_COMPOSE -f docker-compose.prod.yml logs app"
  fi
  sleep 2
done

echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   Installation complete!                     ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║   Admin Dashboard  →  http://localhost:${PORT}  ║"
echo "  ║   Health check     →  http://localhost:${PORT}/health ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""
echo "  Next step: open the URL above and complete the setup wizard."
echo ""
