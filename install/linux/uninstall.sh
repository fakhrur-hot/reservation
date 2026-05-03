#!/usr/bin/env bash
# Sejiwa Booking System — Linux Uninstall
set -euo pipefail

[ "$EUID" -ne 0 ] && echo "Please run as root: sudo bash uninstall.sh" && exit 1

echo "Stopping and disabling sejiwa service..."
systemctl stop sejiwa 2>/dev/null || true
systemctl disable sejiwa 2>/dev/null || true
rm -f /etc/systemd/system/sejiwa.service
systemctl daemon-reload

echo "Removing nginx config..."
rm -f /etc/nginx/sites-enabled/sejiwa
rm -f /etc/nginx/sites-available/sejiwa
systemctl restart nginx 2>/dev/null || true

read -rp "Remove application files at /opt/sejiwa? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  rm -rf /opt/sejiwa
  echo "Application files removed."
fi

read -rp "Remove database (sejiwa_booking)? [y/N] " confirm_db
if [[ "$confirm_db" =~ ^[Yy]$ ]]; then
  sudo -u postgres psql -c "DROP DATABASE IF EXISTS sejiwa_booking;"
  sudo -u postgres psql -c "DROP USER IF EXISTS sejiwa;"
  echo "Database removed."
fi

echo "Uninstall complete."
