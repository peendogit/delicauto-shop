'use strict';
// Sitan HTTP okvir (umjesto Expressa): rute, JSON/form tijelo, static fajlovi.
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
};

function createApp() {
  const routes = [];
  const mws = [];

  const add = (method, pattern, ...fns) => {
    const keys = [];
    const re = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })
      .replace(/\*/g, () => { keys.push('rest'); return '(.*)'; }) + '/?$');
    routes.push({ method, re, keys, fns });
  };

  function decorate(req, res) {
    const u = new URL(req.url, 'http://localhost');
    req.path = u.pathname;
    req.query = Object.fromEntries(u.searchParams);
    req.ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    res.status = (c) => { res.statusCode = c; return res; };
    res.send = (body, type) => {
      if (type) res.setHeader('Content-Type', type);
      res.end(body);
    };
    res.html = (body, status) => { if (status) res.statusCode = status; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(body); };
    res.json = (obj, status) => { if (status) res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); };
    res.redirect = (loc, code = 302) => { res.statusCode = code; res.setHeader('Location', loc); res.end(); };
  }

  function readBody(req, limit = 100000) {
    return new Promise((resolve, reject) => {
      if (req.method === 'GET' || req.method === 'HEAD') return resolve({});
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('prevelik zahtjev'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const type = String(req.headers['content-type'] || '');
        try {
          if (type.includes('application/json')) resolve(raw ? JSON.parse(raw) : {});
          else if (type.includes('application/x-www-form-urlencoded')) resolve(Object.fromEntries(new URLSearchParams(raw)));
          else resolve({});
        } catch { reject(Object.assign(new Error('neispravan JSON'), { status: 400 })); }
      });
      req.on('error', reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    decorate(req, res);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    try {
      for (const mw of mws) { if (await mw(req, res) === false || res.writableEnded) return; }
      const method = req.method === 'HEAD' ? 'GET' : req.method;
      for (const r of routes) {
        if (r.method !== method) continue;
        const m = r.re.exec(req.path);
        if (!m) continue;
        req.params = {};
        r.keys.forEach((k, i) => { try { req.params[k] = decodeURIComponent(m[i + 1]); } catch { req.params[k] = m[i + 1]; } });
        req.body = method === 'POST' ? await readBody(req) : {};
        for (const fn of r.fns) { await fn(req, res); if (res.writableEnded) return; }
        if (!res.writableEnded && !res.streaming) res.end();
        return;
      }
      if (app.notFound) return app.notFound(req, res);
      res.json({ error: 'nije pronađeno' }, 404);
    } catch (err) {
      const status = err.status || 500;
      if (status === 500) console.error('[greška]', req.method, req.url, err);
      if (res.headersSent) return res.end();
      if (app.onError) return app.onError(err, req, res, status);
      res.json({ error: status === 500 ? 'interna greška' : err.message }, status);
    }
  });

  const app = {
    server,
    use: (fn) => mws.push(fn),
    get: (p, ...f) => add('GET', p, ...f),
    post: (p, ...f) => add('POST', p, ...f),
    listen: (port, cb) => server.listen(port, cb),
    notFound: null, onError: null,
  };
  return app;
}

// Static fajlovi iz direktorija, sa sigurnom putanjom i kešom
function serveStatic(dir, maxAgeSec) {
  const root = path.resolve(dir);
  return (req, res) => {
    const rel = path.normalize(req.params.rest || '').replace(/^(\.\.[/\\])+/, '');
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) return res.json({ error: 'nije pronađeno' }, 404);
    let st;
    try { st = fs.statSync(file); } catch { return res.json({ error: 'nije pronađeno' }, 404); }
    if (!st.isFile()) return res.json({ error: 'nije pronađeno' }, 404);
    res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, max-age=' + maxAgeSec);
    res.setHeader('Content-Length', st.size);
    if (req.method === 'HEAD') return res.end();
    res.streaming = true;
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  };
}

module.exports = { createApp, serveStatic, MIME };
