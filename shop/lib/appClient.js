'use strict';
const cfg = require('./config');

// Klijent za API aplikacije za otpad (/shop-api/*)
async function call(method, path, body, timeoutMs = 10000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(cfg.appUrl + cfg.appApiPath + path, {
      method,
      headers: { 'x-api-key': cfg.appKey, 'content-type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    let data = null;
    try { data = await res.json(); } catch { /* prazan odgovor */ }
    return { status: res.status, ok: res.ok, data };
  } catch (e) {
    return { status: 0, ok: false, data: null, error: e.name === 'AbortError' ? 'timeout' : e.message };
  } finally { clearTimeout(timer); }
}

module.exports = {
  health: () => call('GET', '/health'),
  parts: (after, limit = 500) => call('GET', `/parts?after=${after}&limit=${limit}`, null, 60000),
  part: (id, timeout = 5000) => call('GET', `/parts/${Number(id)}`, null, timeout),
  changes: (since) => call('GET', `/changes?since=${Number(since)}`),
  reserve: (partId, qty, orderRef) => call('POST', '/reserve', { partId, qty, orderRef }),
  release: (orderRef) => call('POST', '/release', { orderRef }),
};
