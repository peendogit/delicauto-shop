'use strict';
const cfg = require('./config');

// Telegram obavijest (ako su podešeni token i chat). Greška ne smije srušiti narudžbu.
async function notify(text) {
  if (!cfg.tgToken || !cfg.tgChat) return false;
  try {
    const res = await fetch(`${process.env.TG_API || 'https://api.telegram.org'}/bot${cfg.tgToken}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: cfg.tgChat, text: text.slice(0, 3900), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch (e) { console.error('[telegram]', e.message); return false; }
}

// šalje fotografije (JPEG bufferi) kao album, do 10 komada
async function notifyPhotos(bufs, caption) {
  if (!cfg.tgToken || !cfg.tgChat || !bufs || !bufs.length) return false;
  try {
    const fd = new FormData();
    fd.append('chat_id', cfg.tgChat);
    const media = bufs.slice(0, 10).map((b, i) => {
      fd.append('f' + i, new Blob([b], { type: 'image/jpeg' }), `slika-${i + 1}.jpg`);
      return { type: 'photo', media: 'attach://f' + i, ...(i === 0 && caption ? { caption: caption.slice(0, 900) } : {}) };
    });
    fd.append('media', JSON.stringify(media));
    const res = await fetch(`${process.env.TG_API || 'https://api.telegram.org'}/bot${cfg.tgToken}/sendMediaGroup`, { method: 'POST', body: fd, signal: AbortSignal.timeout(30000) });
    return res.ok;
  } catch (e) { console.error('[telegram]', e.message); return false; }
}
module.exports = { notify, notifyPhotos };
