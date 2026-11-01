#!/bin/bash
# Auto-deploy: pokreće se iz crona svake minute, radi nešto samo ako ima novih izmjena na GitHubu.
#   * * * * * /root/delicauto-shop/deploy/deploy.sh >> /var/log/delicauto-deploy.log 2>&1
cd "$(dirname "$0")/.." || exit 1
git fetch -q || exit 0
[ "$(git rev-parse HEAD)" = "$(git rev-parse @{u})" ] && exit 0
echo "$(date) novi commit, ažuriram…"
git stash -q 2>/dev/null
git pull -q
npm install --omit=dev --silent
pm2 restart delicauto-shop
