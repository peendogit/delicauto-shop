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
// telefon: 066 027 888, 0038766027888 ili +38766027888 -> prikaz "+387 66 027 888", poziv "+38766027888"
const phoneInfo = (() => {
  let d = String(e.SHOP_PHONE || '+387 66 027 888').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '387' + d.slice(1);
  const m = /^387(\d{2})(\d{3})(\d{3})$/.exec(d);
  return { tel: '+' + d, display: m ? `+387 ${m[1]} ${m[2]} ${m[3]}` : '+' + d };
})();
module.exports = {
  port: Number(e.PORT) || 3010,
  siteUrl: (e.SITE_URL || 'http://localhost:' + (e.PORT || 3010)).replace(/\/+$/, ''),
  appUrl: (e.APP_URL || 'http://127.0.0.1:3003').replace(/\/+$/, ''),
  appKey: e.APP_API_KEY || '',
  appApiPath: '/shop-api',
  uploadsDir: e.UPLOADS_DIR || '',
  name: e.SHOP_NAME || 'Auto Otpad Delić',
  city: e.SHOP_CITY || 'Bijeljina',
  phone: phoneInfo.display,
  phoneTel: phoneInfo.tel,
  viber: (e.SHOP_VIBER || '+38766027888').replace(/[^\d+]/g, ''),
  waNumber: (e.SHOP_WHATSAPP || e.SHOP_VIBER || '+38766027888').replace(/\D/g, ''),
  email: (e.SHOP_EMAIL || '').trim(),
  address: (e.SHOP_ADDRESS || 'Pavlovića put 13').trim(),
  mapQuery: (e.SHOP_MAP_QUERY || '44.7860809,19.2464').trim(),
  social: { facebook: (e.SOCIAL_FACEBOOK || 'https://www.facebook.com/share/19jwaNTPPR/').trim(), instagram: (e.SOCIAL_INSTAGRAM || 'https://www.instagram.com/delicauto').trim(), olx: (e.SOCIAL_OLX || 'https://olx.ba/profil/AutoDelic/aktivni').trim() },
  mapLink: (e.SHOP_MAP_LINK || 'https://maps.app.goo.gl/YxhohNsrNt7pEarG6').trim(),
  adminUser: e.ADMIN_USER || 'admin',
  adminPass: e.ADMIN_PASS || '',
  tgToken: String(e.TELEGRAM_BOT_TOKEN || '').replace(/\s+/g, '').replace(/^bot/i, ''),
  tgChat: String(e.TELEGRAM_CHAT_ID || '').replace(/\s+/g, ''),
  mailTo: (e.OTKUP_EMAIL || 'autootpaddelic@gmail.com').trim(),
  smtpHost: e.SMTP_HOST || 'smtp.gmail.com', smtpPort: Number(e.SMTP_PORT) || 465,
  smtpUser: (e.SMTP_USER || '').trim(), smtpPass: (e.SMTP_PASS || '').replace(/\s+/g, ''),
  dataDir: path.resolve(path.join(__dirname, '..'), e.DATA_DIR || './data'),
  pollSeconds: Math.max(2, Number(e.POLL_SECONDS) || 20),
  // radno vrijeme: redovi odvojeni znakom |
  hours: (e.SHOP_HOURS || 'Pon–Pet: 09:00 – 17:00|Subota: 09:00 – 15:00|Nedjelja: ne radimo').split('|').map(x => x.trim()).filter(Boolean),
  pageSize: 24,
};
