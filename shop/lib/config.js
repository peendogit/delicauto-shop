'use strict';
const fs = require('fs');
const path = require('path');

// Minimalni .env čitač (bez dotenv paketa). Postojeće varijable okruženja imaju prednost.
function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trim().startsWith('#')) continue;
      let v = m[2];
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  } catch { /* nema .env */ }
}
loadEnv(path.join(__dirname, '..', '.env'));

const e = process.env;
module.exports = {
  port: Number(e.PORT) || 3010,
  siteUrl: (e.SITE_URL || 'http://localhost:' + (e.PORT || 3010)).replace(/\/+$/, ''),
  appUrl: (e.APP_URL || 'http://127.0.0.1:3003').replace(/\/+$/, ''),
  appKey: e.APP_API_KEY || '',
  appApiPath: '/shop-api',
  uploadsDir: e.UPLOADS_DIR || '',
  name: e.SHOP_NAME || 'Auto Otpad Delić',
  city: e.SHOP_CITY || 'Bijeljina',
  phone: (e.SHOP_PHONE || '066 027 888').trim(),
  phoneTel: (e.SHOP_PHONE || '066 027 888').replace(/[^\d+]/g, '').replace(/^0/, '+387'),
  viber: (e.SHOP_VIBER || '+38766027888').replace(/[^\d+]/g, ''),
  waNumber: (e.SHOP_WHATSAPP || e.SHOP_VIBER || '+38766027888').replace(/\D/g, ''),
  email: (e.SHOP_EMAIL || '').trim(),
  adminUser: e.ADMIN_USER || 'admin',
  adminPass: e.ADMIN_PASS || '',
  tgToken: e.TELEGRAM_BOT_TOKEN || '',
  tgChat: e.TELEGRAM_CHAT_ID || '',
  mailTo: (e.OTKUP_EMAIL || 'autootpaddelic@gmail.com').trim(),
  smtpHost: e.SMTP_HOST || 'smtp.gmail.com', smtpPort: Number(e.SMTP_PORT) || 465,
  smtpUser: (e.SMTP_USER || '').trim(), smtpPass: (e.SMTP_PASS || '').replace(/\s+/g, ''),
  dataDir: path.resolve(path.join(__dirname, '..'), e.DATA_DIR || './data'),
  pollSeconds: Math.max(2, Number(e.POLL_SECONDS) || 20),
  pageSize: 24,
};
