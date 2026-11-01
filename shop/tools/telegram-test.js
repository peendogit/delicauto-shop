'use strict';
// Pomoćnik za Telegram: node tools/telegram-test.js
// 1) bez TELEGRAM_CHAT_ID: ispiše ID tvog chata (prvo pošalji bilo šta svom botu)
// 2) s ID-em: pošalje probnu poruku
const cfg = require('../lib/config');
(async () => {
  if (!cfg.tgToken) return console.log('Nema TELEGRAM_BOT_TOKEN u .env');
  if (!/^\d{6,12}:[A-Za-z0-9_-]{30,}$/.test(cfg.tgToken)) return console.log('Token nema ispravan oblik. Mora izgledati ovako: 1234567890:AAH... (brojevi, dvotačka, pa slova), bez razmaka i bez navodnika.\nDuzina koju sam procitao: ' + cfg.tgToken.length + ' znakova, počinje sa: ' + cfg.tgToken.slice(0, 4) + '…\nProvjeri .env: linija mora biti TELEGRAM_BOT_TOKEN=token (bez razmaka oko =).');
  const api = m => `https://api.telegram.org/bot${cfg.tgToken}/${m}`;
  if (!cfg.tgChat) {
    const r = await (await fetch(api('getUpdates'))).json();
    if (!r.ok) return console.log('Token nije ispravan:', r.description);
    const ids = [...new Set((r.result || []).map(u => u.message && u.message.chat && u.message.chat.id).filter(Boolean))];
    return console.log(ids.length ? 'TVOJ CHAT ID: ' + ids.join(', ') + '\nUpiši ga u .env kao TELEGRAM_CHAT_ID=' + ids[0] : 'Nema poruka. Otvori svog bota u Telegramu, pritisni Start i napiši "zdravo", pa ponovo pokreni.');
  }
  const r = await (await fetch(api('sendMessage'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: cfg.tgChat, text: '✅ Delić shop: Telegram radi.' }) })).json();
  console.log(r.ok ? 'Poslano — provjeri Telegram.' : 'Greška: ' + r.description);
})();
