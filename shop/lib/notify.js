'use strict';
const cfg = require('./config');

// Telegram obavijest (ako su podešeni token i chat). Greška ne smije srušiti narudžbu.
async function notify(text) {
  if (!cfg.tgToken || !cfg.tgChat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${cfg.tgToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.tgChat, text: text.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (e) { console.error('[telegram]', e.message); return false; }
}
module.exports = { notify };
