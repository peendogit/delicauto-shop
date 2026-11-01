#!/bin/bash
# Auto-deploy: pokreće se iz crona svake minute, radi nešto samo ako ima novih izmjena na GitHubu.
#   * * * * * /root/delicauto-shop/shop/deploy/deploy.sh >> /var/log/delicauto-deploy.log 2>&1
# Cron ima skraćenu putanju (PATH), pa je ovdje dopunjavamo da se nađu node, npm, pm2 i git.
export HOME="${HOME:-/root}"
export PATH="/usr/local/bin:/usr/bin:/bin:/usr/local/sbin:/usr/sbin:/sbin:$PATH"
[ -s "$HOME/.nvm/nvm.sh" ] && . "$HOME/.nvm/nvm.sh" >/dev/null 2>&1
for d in "$HOME"/.nvm/versions/node/*/bin "$HOME"/.npm-global/bin /usr/local/lib/node_modules/.bin; do [ -d "$d" ] && PATH="$d:$PATH"; done
export PATH

cd "$(dirname "$0")/.." || exit 1
if ! git fetch -q; then echo "$(date) git fetch nije uspio"; exit 0; fi
[ "$(git rev-parse HEAD)" = "$(git rev-parse '@{u}')" ] && exit 0
echo "$(date) novi commit, ažuriram…"
git stash -q 2>/dev/null
git pull -q || { echo "$(date) git pull nije uspio"; exit 1; }
npm install --omit=dev --silent || echo "$(date) npm install greška"
pm2 restart delicauto-shop && echo "$(date) gotovo"
