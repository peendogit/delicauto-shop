#!/usr/bin/env bash
# Jedna naredba: instalira shop, pravi .env, pokreće PM2 i podešava Nginx.
# Pokretanje:  bash deploy/install.sh
set -e
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
read -rp "Lozinka za /admin: " AP
sed -i "s|^ADMIN_PASS=.*|ADMIN_PASS=${AP}|" .env
npm install --omit=dev
pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart delicauto-shop
pm2 save
if command -v nginx >/dev/null; then
  sudo cp deploy/nginx-delicauto.conf /etc/nginx/sites-available/delicauto
  sudo ln -sf /etc/nginx/sites-available/delicauto /etc/nginx/sites-enabled/delicauto
  sudo nginx -t && sudo systemctl reload nginx
  echo "Za HTTPS: sudo certbot --nginx -d delicauto.com -d www.delicauto.com"
fi
echo "Gotovo. Probaj: http://158.220.96.229:3010  (admin: /admin)"
