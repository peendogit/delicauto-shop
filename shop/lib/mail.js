'use strict';
const tls = require('tls');
const crypto = require('crypto');
const cfg = require('./config');

// Minimalni SMTP klijent (bez paketa): šalje mail s prilozima preko SMTP-a (npr. Gmail, port 465).
// Za Gmail treba „lozinka za aplikacije“ (App password), ne obična lozinka.
const b64 = (buf, wrap) => { const s = Buffer.from(buf).toString('base64'); return wrap ? s.replace(/(.{76})/g, '$1\r\n') : s; };
const encWord = s => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`);

function buildMessage({ from, to, subject, text, attachments = [] }) {
  const boundary = '=_ad_' + crypto.randomBytes(12).toString('hex');
  const head = [
    `From: ${encWord('Auto Otpad Delić')} <${from}>`, `To: ${to}`, `Subject: ${encWord(subject)}`,
    `Date: ${new Date().toUTCString()}`, `Message-ID: <${crypto.randomUUID()}@delicauto.com>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
  ];
  const parts = [`--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(text, true)];
  for (const a of attachments) {
    parts.push(`--${boundary}`, `Content-Type: ${a.contentType}; name="${a.filename}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${a.filename}"`, '', b64(a.data, true));
  }
  parts.push(`--${boundary}--`, '');
  return head.concat(parts).join('\r\n');
}

function smtpSend(msg, from, to) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({ host: cfg.smtpHost, port: cfg.smtpPort, servername: cfg.smtpHost });
    sock.setTimeout(30000, () => { sock.destroy(); reject(new Error('SMTP timeout')); });
    let buf = ''; let waiter = null;
    // odgovor je završen kad zadnja linija ima oblik "250 tekst" (razmak iza koda)
    const check = () => {
      const last = buf.split('\r\n').filter(Boolean).pop();
      if (waiter && last && /^\d{3} /.test(last) && buf.endsWith('\r\n')) { const w = waiter; waiter = null; const r = buf; buf = ''; w(r); }
    };
    sock.on('data', d => { buf += d.toString('utf8'); check(); });
    sock.on('error', reject);
    const read = () => new Promise(r => { waiter = r; check(); });
    const cmd = async (c, ok) => {
      if (c !== null) sock.write(c + '\r\n');
      const r = await read();
      if (!r.startsWith(String(ok))) throw new Error(`SMTP: očekivano ${ok}, dobijeno: ${r.trim().slice(0, 120)}`);
      return r;
    };
    (async () => {
      await cmd(null, 220);
      await cmd('EHLO delicauto.com', 250);
      await cmd('AUTH LOGIN', 334);
      await cmd(b64(cfg.smtpUser), 334);
      await cmd(b64(cfg.smtpPass), 235);
      await cmd(`MAIL FROM:<${from}>`, 250);
      await cmd(`RCPT TO:<${to}>`, 250);
      await cmd('DATA', 354);
      sock.write(msg.replace(/^\./gm, '..') + '\r\n.\r\n');
      await cmd(null, 250);
      sock.write('QUIT\r\n'); sock.end();
    })().then(resolve, reject).finally(() => sock.destroy());
  });
}

// vraća true ako je mail poslan; nikad ne baca grešku (greška ne smije izgubiti ponudu)
async function sendMail({ to, subject, text, attachments }) {
  if (!cfg.smtpUser || !cfg.smtpPass) return false;
  try { await smtpSend(buildMessage({ from: cfg.smtpUser, to, subject, text, attachments }), cfg.smtpUser, to); return true; }
  catch (e) { console.error('[mail]', e.message); return false; }
}
module.exports = { sendMail, buildMessage };
