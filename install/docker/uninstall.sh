#!/usr/bin/env bash
# Sejiwa Booking System — Docker Uninstall
set -euo pipefail

DOCKER_COMPOSE="docker compose"
docker compose version >/dev/null 2>&1 || DOCKER_COMPOSE="docker-compose"

echo "Stopping and removing containers..."
$DOCKER_COMPOSE -f docker-compose.prod.yml down

read -rp "Remove all data volumes (database + redis)? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  $DOCKER_COMPOSE -f docker-compose.prod.yml down -v
  echo "Volumes removed."
fi

echo "Uninstall complete."
