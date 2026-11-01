'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./lib/config');
const { createApp, serveStatic } = require('./lib/mini');
const dbm = require('./lib/db');
const appApi = require('./lib/appClient');
const { makeSync } = require('./lib/sync');
const { notify, notifyPhotos } = require('./lib/notify');
const { sendMail } = require('./lib/mail');
const V = require('./lib/views');
const { makeStats } = require('./lib/stats');

let sharp = null;
try { sharp = require('sharp'); } catch { /* slike se serviraju originalne */ }

const db = dbm.open(cfg.dataDir);
const sync = makeSync({ db, app: appApi, pollSeconds: cfg.pollSeconds, onChange: () => facetCache.clear() });
const app = createApp();
const stats = makeStats(db);
app.use((req, res) => { stats.middleware(req, res); });
const now = () => Date.now();

// ---------- pomoćne ----------
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const digits = s => String(s || '').replace(/\D/g, '');
const hits = new Map();
function limited(req, res, max = 8, windowMs = 10 * 60 * 1000) {
  const k = req.ip + '|' + req.path;
  const t = now();
  const arr = (hits.get(k) || []).filter(x => t - x < windowMs);
  arr.push(t); hits.set(k, arr);
  if (arr.length > max) { res.json({ error: 'Previše zahtjeva, pokušaj malo kasnije.' }, 429); return true; }
  return false;
}
setInterval(() => { const t = now(); for (const [k, v] of hits) if (!v.some(x => t - x < 1000000)) hits.delete(k); }, 600000).unref();

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeRef() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2), mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  const r = Array.from(crypto.randomBytes(4), b => REF_CHARS[b % REF_CHARS.length]).join('');
  return `DS-${yy}${mm}${dd}-${r}`;
}

const getPart = id => { const r = db.prepare('SELECT * FROM parts WHERE id = ?').get(id); return r ? V.rowToPart(r) : null; };

// Samostalni način rada: bez APP_API_KEY shop radi iz uvezene baze (tools/import-dump.js), bez veze s aplikacijom.
// Dostupnost se ne provjerava uživo; kad narudžbu u /admin označiš „završena“, dio nestaje iz shopa.
const STANDALONE = !cfg.appKey;
if (STANDALONE) {
  appApi.part = async id => { const p = getPart(id); return p ? { ok: true, data: { ...p, available: true } } : { ok: true, data: { id: undefined } }; };
  appApi.reserve = async () => ({ ok: true });
  appApi.release = async () => ({ ok: true });
  sync.applyItem = () => {};
  sync.poll = () => {};
  sync.fullSync = () => {};
  sync.start = () => console.log('[shop] samostalni način: dijelovi iz uvezene baze, bez veze s aplikacijom');
}

// ---------- facet-i (keširani 60 s) ----------
const facetCache = new Map();
function cached(key, fn) {
  const c = facetCache.get(key);
  if (c && now() - c.t < 60000) return c.v;
  const v = fn(); facetCache.set(key, { t: now(), v }); return v;
}
const makesList = () => cached('makes', () => db.prepare(
  `SELECT make, COUNT(*) AS n FROM parts WHERE make IS NOT NULL AND make <> '' GROUP BY make ORDER BY n DESC`).all());
const yardForF = f => {
  if (f.marka && f.model) return yardFor(f.marka, f.model);
  if (f.vm) { const m = matchCombos(f.vm); return m.slice(0, 5).flatMap(c => yardFor(c.make, c.model)); }
  return [];
};
const yardFor = (marka, model) => (marka && model)
  ? db.prepare('SELECT make, model, year, fuel, engine_code FROM yard_vehicles WHERE make = ? AND model = ? ORDER BY year DESC').all(marka, model) : [];
const alpha = (a, b) => String(a).localeCompare(String(b), 'bs', { numeric: true });
const modelsOf = make => cached('models:' + make, () => db.prepare(
  `SELECT model, COUNT(*) AS n FROM parts WHERE make = ? AND model IS NOT NULL AND model <> '' GROUP BY model`).all(make)
  .sort((a, b) => alpha(a.model, b.model)));
// vozila se grupišu samo po modelu i godištima (bez motora): "Golf 6 (08-13) · 1.6" -> "Golf 6 (08-13)"
const VEH_LABEL = "CASE WHEN instr(vehicle, ' · ') > 0 THEN substr(vehicle, 1, instr(vehicle, ' · ') - 1) ELSE vehicle END";
const vehiclesOf = (make, model) => cached(`veh:${make}|${model}`, () => db.prepare(
  `SELECT COALESCE(${VEH_LABEL}, '') AS vehicle, COUNT(*) AS n FROM parts
   WHERE make = ? AND model = ? GROUP BY 1`).all(make, model)
  .sort((a, b) => alpha(a.vehicle, b.vehicle)));
const distinctOf = (col, numeric) => cached('d:' + col, () => db.prepare(
  `SELECT DISTINCT ${col} AS v FROM parts WHERE ${col} IS NOT NULL AND ${col} <> ''`).all().map(r => String(r.v))
  .sort(numeric ? (a, b) => parseFloat(a) - parseFloat(b) || alpha(a, b) : alpha));
// ---- vozilo kucanjem: "A5" -> Audi A5 8T, Audi A5 8F ... ----
const foldS = x => String(x || '').toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const compactS = x => foldS(x).replace(/[^a-z0-9]/g, '');
const combos = () => cached('combos', () => {
  // godišta modela: najraniji početak i najkasniji kraj iz oznaka "(07-11)" na vozilima
  const yrs = new Map();
  for (const v of db.prepare("SELECT make, model, vehicle FROM parts WHERE make <> '' AND model <> '' GROUP BY make, model, vehicle").all()) {
    const m = /\((\d{2})\s*-\s*(\d{2})\)/.exec(v.vehicle || ''); if (!m) continue;
    const k = v.make + '|' + v.model, y = yrs.get(k) || { a: 99, b: -1 };
    const full = x => (Number(x) < 70 ? 2000 : 1900) + Number(x);
    if (full(m[1]) < (y.a === 99 ? 9999 : full(y.a))) y.a = m[1];
    if (full(m[2]) > (y.b === -1 ? 0 : full(y.b))) y.b = m[2];
    yrs.set(k, y);
  }
  return db.prepare("SELECT make, model, COUNT(*) AS n FROM parts WHERE make <> '' AND model <> '' GROUP BY make, model").all()
  .map(r => { const y = yrs.get(r.make + '|' + r.model), label = `${r.make} ${r.model}`; return { make: r.make, model: r.model, n: r.n, label, show: y ? `${label} (${y.a}-${y.b})` : label, f: foldS(label), c: compactS(label), words: foldS(label).split(/[^a-z0-9]+/).filter(Boolean) }; });
});
function matchCombos(text) {
  text = String(text || '').replace(/\s*\(\s*\d{2}\s*-\s*\d{2}\s*\)\s*$/, '');
  const toks = foldS(text).split(/\s+/).filter(Boolean).slice(0, 5);
  if (!toks.length) return [];
  const exact = combos().filter(c => c.f === foldS(text).trim());
  if (exact.length) return exact;
  const hit = combos().filter(c => toks.every(t => c.words.some(w => w.startsWith(t.replace(/[^a-z0-9]/g, ''))) || (compactS(t).length >= 3 && c.c.includes(compactS(t)))));
  const t0 = toks[0];
  return hit.sort((a, b) => ((b.f.startsWith(t0) ? 1 : 0) - (a.f.startsWith(t0) ? 1 : 0)) || ((b.words.includes(t0) ? 1 : 0) - (a.words.includes(t0) ? 1 : 0)) || b.n - a.n);
}
app.get('/api/vozila', (req, res) => {
  if (limited(req, res, 900)) return;
  res.setHeader('Cache-Control', 'no-store');
  res.json(matchCombos(clean(req.query.q, 60)).slice(0, 30).map(c => c.show));
});
function facets(make, model) {
  return {
    makes: makesList().map(m => m.make).sort(alpha),
    models: make ? modelsOf(make).map(m => m.model) : [],
    vehicles: make && model ? [...new Set(vehiclesOf(make, model).map(v => v.vehicle).filter(Boolean))] : [],
    types: distinctOf('type'), groups: distinctOf('grp'), sides: distinctOf('side'), fuels: distinctOf('fuel'),
    displacements: distinctOf('displacement', true), gearboxes: distinctOf('gearbox'), gears: distinctOf('gears', true),
    bodies: distinctOf('body'), drives: distinctOf('drive'),
  };
}

// ---------- pretraga ----------
function ftsQuery(q) {
  const raw = clean(q, 100);
  if (!raw) return null;
  const terms = (/\s/.test(raw) ? raw.split(/\s+/) : [raw]).map(t => t.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean).slice(0, 8);
  if (!terms.length) return null;
  const and = terms.map(t => `"${t}"*`).join(' ');
  const joined = terms.join('');
  return terms.length > 1 && joined.length >= 6 ? `(${and}) OR "${joined}"*` : and;
}

function buildList(f) {
  const where = [], args = [];
  if (f.marka) { where.push('make = ?'); args.push(f.marka); }
  if (f.model) { where.push('model = ?'); args.push(f.model); }
  if (f.vozilo) { where.push("(vehicle = ? OR vehicle LIKE ? ESCAPE '\\')"); args.push(f.vozilo, f.vozilo.replace(/[\\%_]/g, '\\$&') + ' · %'); }
  if (f.grupa) { where.push(f.grupa === 'Ostalo' ? `(grp IS NULL OR grp = '' OR grp = 'Ostalo')` : 'grp = ?'); if (f.grupa !== 'Ostalo') args.push(f.grupa); }
  if (f.tip) {
    if (f.tip === 'Ostalo') where.push(`(type IS NULL OR type = '' OR type = 'Ostalo')`);
    else if (db.prepare('SELECT 1 FROM parts WHERE type = ? COLLATE NOCASE LIMIT 1').get(f.tip)) { where.push('type = ? COLLATE NOCASE'); args.push(f.tip); }
    else { where.push("type LIKE ? ESCAPE '\\'"); args.push('%' + f.tip.replace(/[\\%_]/g, '\\$&') + '%'); }
  }
  if (f.vm) {
    const m = matchCombos(f.vm).slice(0, 80);
    if (!m.length) where.push('0 = 1');
    else { where.push('(' + m.map(() => '(make = ? AND model = ?)').join(' OR ') + ')'); m.forEach(c => args.push(c.make, c.model)); }
  }
  if (f.gorivo) { where.push('fuel = ?'); args.push(f.gorivo); }
  if (f.strana) { where.push('side = ?'); args.push(f.strana); }
  if (f.ccm) { where.push('displacement = ?'); args.push(f.ccm); }
  if (f.mjenjac) { where.push('gearbox = ?'); args.push(f.mjenjac); }
  if (f.brzina) { where.push('gears = ?'); args.push(f.brzina); }
  if (f.karoserija) { where.push('body = ?'); args.push(f.karoserija); }
  if (f.pogon) { where.push('drive = ?'); args.push(f.pogon); }
  if (f.kw && Number.isFinite(parseFloat(f.kw))) { where.push('CAST(power AS REAL) = ?'); args.push(parseFloat(f.kw)); }
  const like = v => '%' + String(v).replace(/[\\%_]/g, '\\$&') + '%';
  if (f.sifra) { where.push("internal LIKE ? ESCAPE '\\'"); args.push(like(f.sifra)); }
  if (f.kodmj) { where.push("gearbox_code LIKE ? ESCAPE '\\'"); args.push(like(f.kodmj)); }
  if (f.kodmot) { where.push("engine_code LIKE ? ESCAPE '\\'"); args.push(like(f.kodmot)); }
  if (f.katbr) { const n = f.katbr.replace(/[^A-Za-z0-9]/g, '').toUpperCase(); if (n) { where.push('catalog_norm LIKE ?'); args.push('%' + n + '%'); } }
  if (f.cijena) { where.push('price IS NOT NULL AND price > 0'); }
  if (f.q) {
    const m = ftsQuery(f.q);
    if (m) { where.push('id IN (SELECT rowid FROM parts_fts WHERE parts_fts MATCH ?)'); args.push(m); }
  }
  const order = f.sort === 'cijena_asc' ? '(price IS NULL), price ASC, id DESC'
    : f.sort === 'cijena_desc' ? '(price IS NULL), price DESC, id DESC' : 'id DESC';
  return { w: where.length ? 'WHERE ' + where.join(' AND ') : '', args, order };
}

// ---------- stranice ----------
app.get('/static/*', serveStatic(path.join(__dirname, 'public'), 86400));
app.get('/manifest.webmanifest', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.end(JSON.stringify({
    name: 'Auto Otpad Delić', short_name: 'Delić', description: 'Polovni auto dijelovi, Bijeljina',
    lang: 'bs', start_url: '/?utm_source=pwa', scope: '/', display: 'standalone',
    background_color: '#0f2a47', theme_color: '#0f2a47',
    icons: [
      { src: '/static/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/static/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/static/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  }));
});
app.get('/sw.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.end(`var V='delic-v1',OFF='/offline';
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return c.add(OFF)}).then(function(){return self.skipWaiting()}))});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(x){return x!==V}).map(function(x){return caches.delete(x)}))}).then(function(){return self.clients.claim()}))});
self.addEventListener('fetch',function(e){var r=e.request,u=new URL(r.url);
if(r.method!=='GET'||u.origin!==location.origin||u.pathname.indexOf('/admin')===0||u.pathname.indexOf('/api')===0)return;
if(r.mode==='navigate'){e.respondWith(fetch(r).catch(function(){return caches.match(OFF)}));return}
if(u.pathname.indexOf('/static/')===0){e.respondWith(fetch(r).then(function(x){var c=x.clone();caches.open(V).then(function(h){h.put(r,c)});return x}).catch(function(){return caches.match(r)}))}});
`);
});
app.get('/offline', (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Nema veze</title><body style="font-family:sans-serif;text-align:center;padding:48px 20px;background:#0f2a47;color:#fff"><img src="/static/logo.png" width="160" alt="Delić"><h2>Nema internet veze</h2><p>Pozovite nas: <a style="color:#f5a300" href="tel:+38766027888">+387 66 027 888</a></p><p><a style="color:#f5a300" href="/">Pokušaj ponovo</a></p>');
});
app.get('/favicon.ico', (req, res) => res.redirect('/static/favicon.png', 301));

app.get('/', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) AS n FROM parts').get().n;
  const latest = db.prepare('SELECT * FROM parts ORDER BY id DESC LIMIT 12').all().map(V.rowToPart);
  res.html(V.home({ makes: makesList().slice(0, 24), latest, total, facets: facets(), f: readFilters({}) }));
});

// Stablo grupa dijelova (grupa -> tip dijela) za trenutni izbor vozila/pretrage
function groupTree(f) {
  const { w, args } = buildList({ ...f, grupa: '', tip: '' });
  return cached('tree:' + w + JSON.stringify(args), () => {
    const rows = db.prepare(`SELECT COALESCE(NULLIF(grp, ''), 'Ostalo') AS g, COALESCE(NULLIF(type, ''), 'Ostalo') AS t, COUNT(*) AS n
      FROM parts ${w} GROUP BY g, t`).all(...args);
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.g)) map.set(r.g, { grupa: r.g, n: 0, types: [] });
      const g = map.get(r.g); g.n += r.n; g.types.push({ tip: r.t, n: r.n });
    }
    const out = [...map.values()].sort((a, b) => (a.grupa === 'Ostalo') - (b.grupa === 'Ostalo') || alpha(a.grupa, b.grupa));
    out.forEach(g => g.types.sort((a, b) => alpha(a.tip, b.tip)));
    return out;
  });
}

const readFilters = q => ({
  q: clean(q.q, 100), vm: clean(q.vm, 80), marka: clean(q.marka, 60), model: clean(q.model, 100), vozilo: clean(q.vozilo, 100),
  grupa: clean(q.grupa, 100), tip: clean(q.tip, 100), gorivo: clean(q.gorivo, 40), strana: clean(q.strana, 40),
  ccm: clean(q.ccm, 20), kw: clean(q.kw, 20), sifra: clean(q.sifra, 40), katbr: clean(q.katbr, 60),
  kodmj: clean(q.kodmj, 40), kodmot: clean(q.kodmot, 40), mjenjac: clean(q.mjenjac, 40), brzina: clean(q.brzina, 20),
  karoserija: clean(q.karoserija, 60), pogon: clean(q.pogon, 40), cijena: q.cijena === '1' ? '1' : '',
  sort: ['cijena_asc', 'cijena_desc'].includes(q.sort) ? q.sort : '',
  prikaz: q.prikaz === 'mreza' ? 'mreza' : 'lista',
});

// TecDoc-style navigacija: marka -> model -> vozilo / grupe dijelova
app.get('/katalog', (req, res) => {
  const marka = clean(req.query.marka, 60), model = clean(req.query.model, 100);
  const base = { marka, model };
  res.html(V.catalog({
    marka, model,
    makes: makesList().slice().sort((a, b) => alpha(a.make, b.make)),
    models: marka ? modelsOf(marka) : [],
    variants: marka && model ? vehiclesOf(marka, model) : [],
    tree: marka && model ? groupTree(base) : [],
    total: marka && model ? db.prepare('SELECT COUNT(*) AS n FROM parts WHERE make = ? AND model = ?').get(marka, model).n : 0,
    yard: yardFor(marka, model),
  }));
});

app.get('/api/facets', (req, res) => {
  const marka = clean(req.query.marka, 60), model = clean(req.query.model, 100);
  res.setHeader('Cache-Control', 'public, max-age=60');
  const f = facets(marka, model);
  res.json({ models: f.models, vehicles: f.vehicles });
});

app.get('/dijelovi', (req, res) => {
  const f = readFilters(req.query);
  const { w, args, order } = buildList(f);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM parts ${w}`).get(...args).n;
  const pages = Math.max(1, Math.ceil(total / cfg.pageSize));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const rows = db.prepare(`SELECT * FROM parts ${w} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, cfg.pageSize, (page - 1) * cfg.pageSize).map(V.rowToPart);
  const baseQuery = (extra) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...f, ...extra })) if (v && !(k === 'page' && v === 1) && !(k === 'prikaz' && v === 'lista')) p.set(k, v);
    return p.toString();
  };
  if (!(parseInt(req.query.page, 10) > 1)) {
    const term = f.q || f.katbr || f.sifra || f.tip || f.kodmot || '';
    const veh = [f.marka, f.model].filter(Boolean).join(' ') || f.vm;
    stats.search(req, { kind: 'dio', term, vehicle: veh, results: total });
  }
  if (req.query.frag) { res.setHeader('Cache-Control', 'no-store'); return res.html(V.listFrag({ rows, total, page, pages, f, baseQuery, yard: yardForF(f) })); }
  res.html(V.list({ rows, total, page, pages, f, facets: facets(f.marka, f.model), tree: groupTree(f), baseQuery, yard: yardForF(f) }));
});

app.get('/dio/:slug', async (req, res) => {
  // adresa: /dio/<kataloski-broj>-<naziv>-<id>  (stari oblik /dio/<id>-<naziv> se i dalje prepoznaje)
  const tail = /-(\d{1,16})$/.exec(req.params.slug), head = /^(\d{1,16})(?:-|$)/.exec(req.params.slug);
  let id = tail ? parseInt(tail[1], 10) : 0;
  if (!id || !getPart(id)) id = head ? parseInt(head[1], 10) : id;
  if (!id) return res.html(V.notFound(), 404);
  // provjera uživo kod aplikacije: prodan dio se ne smije prikazati kao dostupan
  const live = await appApi.part(id, 3000);
  if (live.ok && live.data) sync.applyItem(live.data);
  const p = getPart(id);
  if (!p) return res.html(V.unavailable(id), 410);
  const canonical = V.partUrl(p);
  if (decodeURIComponent(req.path) !== canonical) return res.redirect(canonical, 301);
  stats.partView(req, id, `${p.catalog ? p.catalog + ' · ' : ''}${V.partTitle(p)}`);
  res.html(V.detail(p));
});

app.get('/korpa', (req, res) => res.redirect('/', 301));
app.get('/kontakt', (req, res) => res.html(V.contact()));

// ---------- slike (proxy + smanjivanje, keš na disku) ----------
const IMG_DIR = path.join(cfg.dataDir, 'imgcache');
fs.mkdirSync(IMG_DIR, { recursive: true });
const IMG_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const pending = new Map();

async function loadSource(rel) {
  if (cfg.uploadsDir) {
    const root = path.resolve(cfg.uploadsDir);
    const file = path.resolve(root, rel);
    if (!file.startsWith(root + path.sep)) throw new Error('putanja');
    return fs.promises.readFile(file);
  }
  const r = await fetch(`${cfg.appUrl}/uploads/${rel.split('/').map(encodeURIComponent).join('/')}`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return Buffer.from(await r.arrayBuffer());
}

app.get('/img/:w/*', async (req, res) => {
  const w = Number(req.params.w);
  const rel = String(req.params.rest || '');
  const ext = path.extname(rel).toLowerCase();
  if (![240, 480, 960, 1600].includes(w) || !IMG_TYPES[ext] || rel.includes('..') || rel.startsWith('/') || rel.length > 220) {
    return res.json({ error: 'nije pronađeno' }, 404);
  }
  const key = crypto.createHash('sha1').update(rel).digest('hex');
  const cacheFile = path.join(IMG_DIR, `${w}_${key}.jpg`);
  const sendFile = (file, type) => {
    res.streaming = true;
    res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'public, max-age=604800');
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  };
  if (sharp && fs.existsSync(cacheFile)) return sendFile(cacheFile, 'image/jpeg');
  try {
    if (!sharp) {
      const buf = await loadSource(rel);
      res.setHeader('Content-Type', IMG_TYPES[ext]); res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.end(buf);
    }
    if (!pending.has(cacheFile)) {
      pending.set(cacheFile, (async () => {
        const src = await loadSource(rel);
        const out = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).jpeg({ quality: 78, mozjpeg: true }).toBuffer();
        await fs.promises.writeFile(cacheFile, out);
      })().finally(() => pending.delete(cacheFile)));
    }
    await pending.get(cacheFile);
    return sendFile(cacheFile, 'image/jpeg');
  } catch {
    res.json({ error: 'slika nije dostupna' }, 404);
  }
});

// ---------- API za frontend ----------
app.get('/api/dijelovi', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 30);
  res.setHeader('Cache-Control', 'no-store');
  if (!ids.length) return res.json([]);
  const rows = db.prepare(`SELECT * FROM parts WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids).map(V.rowToPart);
  res.json(rows.map(p => {
    const imgs = V.parseImgs(p);
    return { id: p.id, title: V.partTitle(p), internal: p.internal, price: p.price || null, qty: p.qty || 1,
      img: imgs[0] ? V.imgUrl(imgs[0], 240) : null, url: V.partUrl(p) };
  }));
});

app.post('/api/narudzba', async (req, res) => {
  if (limited(req, res, 5)) return;
  const b = req.body || {};
  if (b.hp) return res.json({ ok: true, ref: '—' });
  const name = clean(b.name, 80), phone = clean(b.phone, 40), email = clean(b.email, 120);
  const delivery = b.delivery === 'preuzimanje' ? 'preuzimanje' : 'dostava';
  const city = clean(b.city, 80), address = clean(b.address, 160), note = clean(b.note, 500);
  if (name.length < 2) return res.json({ error: 'Upiši ime i prezime.' }, 400);
  if (digits(phone).length < 6) return res.json({ error: 'Upiši ispravan broj telefona.' }, 400);
  if (delivery === 'dostava' && (city.length < 2 || address.length < 3)) return res.json({ error: 'Upiši grad i adresu za dostavu.' }, 400);

  const want = new Map();
  for (const it of Array.isArray(b.items) ? b.items.slice(0, 30) : []) {
    const id = parseInt(it.id, 10), qty = parseInt(it.qty, 10) || 1;
    if (id > 0 && qty > 0 && qty <= 50) want.set(id, (want.get(id) || 0) + qty);
  }
  if (!want.size) return res.json({ error: 'Korpa je prazna.' }, 400);

  const ref = makeRef();
  const lines = [];
  const bad = [];
  try {
    for (const [id, qty] of want) {
      const live = await appApi.part(id, 6000);
      if (!live.ok || !live.data) { await appApi.release(ref); return res.json({ error: 'Trenutno ne možemo potvrditi dostupnost. Pokušaj za koju minutu ili nas nazovi.' }, 503); }
      sync.applyItem(live.data);
      const p = live.data;
      const title = p.id ? V.partTitle({ ...p, id }) : `Dio #${id}`;
      if (!p.available) { bad.push({ id, why: `Dio „${title}“ više nije dostupan.` }); continue; }
      if (!p.price) { bad.push({ id, why: `Za „${title}“ pošalji upit (nema cijene).` }); continue; }
      if (qty > p.qty) { bad.push({ id, why: `Od dijela „${title}“ je dostupno ${p.qty} kom.` }); continue; }
      const r = await appApi.reserve(id, qty, ref);
      if (!r.ok) { bad.push({ id, why: `Dio „${title}“ je upravo rezervisan ili prodan.` }); sync.poll(); continue; }
      lines.push({ id, title, internal: p.internal, price: p.price, qty });
    }
  } catch (e) {
    console.error('[narudzba]', e); await appApi.release(ref).catch(() => {});
    return res.json({ error: 'Došlo je do greške, pokušaj ponovo.' }, 500);
  }
  if (bad.length) {
    await appApi.release(ref);
    return res.json({ error: bad.map(x => x.why).join(' '), unavailable: bad.map(x => x.id) }, 409);
  }
  const total = lines.reduce((a, l) => a + l.price * l.qty, 0);
  try {
    db.exec('BEGIN');
    const o = db.prepare(`INSERT INTO orders(ref, name, phone, email, city, address, delivery, note, total, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(ref, name, phone, email || null, city || null, address || null, delivery, note || null, total, now());
    const oid = Number(o.lastInsertRowid);
    const li = db.prepare('INSERT INTO order_items(order_id, part_id, title, internal, price, qty) VALUES (?,?,?,?,?,?)');
    for (const l of lines) li.run(oid, l.id, l.title, l.internal || null, l.price, l.qty);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* */ }
    console.error('[narudzba] upis', e); await appApi.release(ref).catch(() => {});
    return res.json({ error: 'Došlo je do greške, pokušaj ponovo.' }, 500);
  }
  notify(`🛒 Nova narudžba ${ref}\n${name} · ${phone}\n${delivery === 'dostava' ? `Dostava: ${city}, ${address}` : 'Preuzimanje'}\n` +
    lines.map(l => `• ${l.title}${l.internal ? ' [' + l.internal + ']' : ''} ×${l.qty} = ${V.money(l.price * l.qty)}`).join('\n') +
    `\nUkupno: ${V.money(total)}${note ? '\nNapomena: ' + note : ''}\n${cfg.siteUrl}/admin`);
  res.json({ ok: true, ref });
});

// ---------- SEO ----------
app.get('/robots.txt', (req, res) => res.send(
  `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /korpa\nSitemap: ${cfg.siteUrl}/sitemap.xml\n`, 'text/plain; charset=utf-8'));

const CHUNK = 40000;
const xml = body => `<?xml version="1.0" encoding="UTF-8"?>\n${body}`;
app.get('/sitemap.xml', (req, res) => {
  const n = db.prepare('SELECT COUNT(*) AS n FROM parts').get().n;
  const chunks = Math.max(1, Math.ceil(n / CHUNK));
  res.send(xml(`<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${cfg.siteUrl}/sitemap-pages.xml</loc></sitemap>${
    Array.from({ length: chunks }, (_, i) => `<sitemap><loc>${cfg.siteUrl}/sitemap-dijelovi-${i + 1}.xml</loc></sitemap>`).join('')}</sitemapindex>`), 'application/xml; charset=utf-8');
});
app.get('/sitemap-pages.xml', (req, res) => {
  const urls = ['/', '/katalog', '/dijelovi', '/felne', '/otkup', '/kontakt', ...makesList().map(m => '/katalog?marka=' + encodeURIComponent(m.make)),
    ...db.prepare('SELECT * FROM rims').all().map(r => V.rimUrl(rimRow(r)))];
  res.send(xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${V.esc(cfg.siteUrl + u)}</loc></url>`).join('')}</urlset>`), 'application/xml; charset=utf-8');
});
app.get('/sitemap-dijelovi-:n.xml', (req, res) => {
  const n = Math.max(1, parseInt(req.params.n, 10) || 1);
  const rows = db.prepare('SELECT * FROM parts ORDER BY id LIMIT ? OFFSET ?').all(CHUNK, (n - 1) * CHUNK).map(V.rowToPart);
  res.send(xml(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map(p => `<url><loc>${V.esc(cfg.siteUrl + V.partUrl(p))}</loc></url>`).join('')}</urlset>`), 'application/xml; charset=utf-8');
});

app.get('/health', (req, res) => res.json({ ok: true, parts: db.prepare('SELECT COUNT(*) AS n FROM parts').get().n }));

// ---------- admin ----------
function adminAuth(req, res) {
  if (!cfg.adminPass) { res.html('<h1>Admin je isključen</h1><p>Postavi ADMIN_PASS u .env</p>', 503); return false; }
  const h = String(req.headers.authorization || '');
  const [u, ...pw] = Buffer.from(h.replace(/^Basic /, ''), 'base64').toString().split(':');
  const hash = s => crypto.createHash('sha256').update(String(s)).digest();
  const t = now(), fk = 'adminfail|' + req.ip, fails = (hits.get(fk) || []).filter(x => t - x < 15 * 60 * 1000);
  if (fails.length >= 8) { res.html('Previše pogrešnih pokušaja. Pokušaj za 15 minuta.', 429); return false; }
  if (h.startsWith('Basic ') && crypto.timingSafeEqual(hash(u), hash(cfg.adminUser)) && crypto.timingSafeEqual(hash(pw.join(':')), hash(cfg.adminPass))) return true;
  if (h) { fails.push(t); hits.set(fk, fails); }
  res.setHeader('WWW-Authenticate', 'Basic realm="Delic admin", charset="UTF-8"');
  res.html('Potrebna prijava', 401); return false;
}
function sameOrigin(req) {
  const o = req.headers.origin; if (!o) return true;
  try { return new URL(o).host === req.headers.host; } catch { return false; }
}
const fmtTs = t => new Date(t).toLocaleString('bs-BA', { timeZone: 'Europe/Sarajevo' });

// ---- felne ----
const rimFacets = () => cached('rimf', () => {
  const d = (col, num) => db.prepare(`SELECT DISTINCT ${col} AS v FROM rims WHERE ${col} IS NOT NULL AND ${col} <> ''`).all().map(r => String(r.v))
    .sort(num ? (a, b) => parseFloat(a) - parseFloat(b) || alpha(a, b) : alpha);
  return { types: d('type'), diameters: d('diameter', true), widths: d('width', true), bolts: d('bolts'), centers: d('center', true), makes: d('make') };
});
const rimRow = r => ({ ...r, price: r.price || null });
app.get('/felne', (req, res) => {
  const q = req.query;
  const f = { tip: clean(q.tip, 60), promjer: clean(q.promjer, 10), sirina: clean(q.sirina, 10), raspored: clean(q.raspored, 20), marka: clean(q.marka, 60), centar: clean(q.centar, 10).replace(',', '.') };
  const where = [], args = [];
  if (f.tip) { where.push('type = ?'); args.push(f.tip); }
  if (f.promjer) { where.push('diameter = ?'); args.push(f.promjer); }
  if (f.sirina) { where.push('width = ?'); args.push(f.sirina); }
  if (f.raspored) { where.push('bolts = ?'); args.push(f.raspored); }
  if (f.marka) { where.push('make = ?'); args.push(f.marka); }
  if (f.centar) { where.push("center LIKE ? ESCAPE '\\'"); args.push(f.centar.replace(/[\\%_]/g, '\\$&') + '%'); }
  const rows = db.prepare(`SELECT * FROM rims ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CAST(diameter AS REAL), id LIMIT 300`).all(...args).map(rimRow);
  const rt = [f.tip, f.promjer && f.promjer + '"', f.sirina && f.sirina + 'J', f.raspored, f.centar && 'cb ' + f.centar].filter(Boolean).join(' ');
  if (rt || f.marka) stats.search(req, { kind: 'felne', term: rt ? 'felne ' + rt : '', vehicle: f.marka || '', results: rows.length });
  res.html(V.rimsList({ rows, f, fx: rimFacets() }));
});
app.get('/felna/:slug', (req, res) => {
  const m = /-(\d{1,16})$/.exec(req.params.slug);
  const r = m && db.prepare('SELECT * FROM rims WHERE id = ?').get(parseInt(m[1], 10));
  if (!r) return res.html(V.unavailable(0), 410);
  const rr = rimRow(r), canonical = V.rimUrl(rr);
  if (decodeURIComponent(req.path) !== canonical) return res.redirect(canonical, 301);
  stats.partView(req, -rr.id, 'Felne: ' + V.rimTitle(rr));
  res.html(V.rimDetail(rr));
});

// ---- otkup vozila: formular sa slikama; ponuda ide na mail, u admin i na Telegram ----
const OTKUP_DIR = path.join(cfg.dataDir, 'otkup');
const otkupDay = { d: '', n: 0 };
app.get('/otkup', (req, res) => res.html(V.buyout()));
app.post('/api/otkup', async (req, res) => {
  if (limited(req, res, 4)) return;
  const day = new Date().toDateString();
  if (otkupDay.d !== day) { otkupDay.d = day; otkupDay.n = 0; }
  if (++otkupDay.n > 40) return res.json({ error: 'Previše zahtjeva danas, pozovi nas na telefon.' }, 429);
  const b = req.body || {};
  if (b.hp) return res.json({ ok: true });
  const name = clean(b.name, 80), phone = clean(b.phone, 40), location = clean(b.location, 120);
  const vehicle = clean(b.vehicle, 120), desc = String(b.description ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, 1500);
  if (name.length < 2) return res.json({ error: 'Upiši ime i prezime.' }, 400);
  if (digits(phone).length < 6) return res.json({ error: 'Upiši ispravan broj telefona.' }, 400);
  if (location.length < 2) return res.json({ error: 'Upiši gdje se vozilo nalazi.' }, 400);
  const imgs = [];
  for (const d of (Array.isArray(b.images) ? b.images.slice(0, 8) : [])) {
    const m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d));
    if (!m) continue;
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length < 500 || buf.length > 2_500_000 || buf[0] !== 0xff || buf[1] !== 0xd8) continue;
    imgs.push(buf);
  }
  const r = db.prepare('INSERT INTO buyouts(name, phone, location, vehicle, description, images, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(name, phone, location, vehicle, desc, imgs.length, Date.now());
  const id = Number(r.lastInsertRowid);
  try { fs.mkdirSync(OTKUP_DIR, { recursive: true }); imgs.forEach((buf, i) => fs.writeFileSync(path.join(OTKUP_DIR, `${id}-${i + 1}.jpg`), buf)); }
  catch (e) { console.error('[otkup] snimanje slika', e.message); }
  const text = `Nova ponuda za otkup vozila (#${id})\n\nIme: ${name}\nTelefon: ${phone}\nLokacija vozila: ${location}\nVozilo: ${vehicle || '—'}\nSlika: ${imgs.length}\n\nOpis stanja:\n${desc || '—'}\n\nAdmin: ${cfg.siteUrl}/admin\n`;
  const mailed = await sendMail({ to: cfg.mailTo, subject: `Otkup vozila: ${vehicle || 'novo vozilo'} — ${location}`, text,
    attachments: imgs.map((data, i) => ({ filename: `vozilo-${id}-${i + 1}.jpg`, contentType: 'image/jpeg', data })) });
  if (mailed) db.prepare('UPDATE buyouts SET mailed = 1 WHERE id = ?').run(id);
  notify(`🚗 Ponuda za otkup #${id}\nIme: ${name}\nTelefon: ${phone}\nVozilo: ${vehicle || '—'}\nLokacija: ${location}\nOpis: ${desc || '—'}\nSlika: ${imgs.length}${mailed ? ' · poslano na mail' : ''}\n${cfg.siteUrl}/admin`)
    .then(() => notifyPhotos(imgs, `Otkup #${id} · ${name} · ${phone}`));
  res.json({ ok: true });
});
app.get('/admin/otkup/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  const o = db.prepare('SELECT * FROM buyouts WHERE id = ?').get(parseInt(req.params.id, 10) || 0);
  if (!o) return res.html(V.notFound(), 404);
  const E = V.esc;
  const body = `<div class="admin"><p><a href="/admin">← Otkup vozila</a></p>
<h1>${E(o.vehicle || 'Vozilo')} <small class="muted">#${o.id}</small></h1>
<p class="muted">${fmtTs(o.created_at)}${o.mailed ? ' · mail ✓' : ''}</p>
<div class="box"><p><b>${E(o.name)}</b><br><a class="btn" href="tel:${E(o.phone)}">📞 ${E(o.phone)}</a></p>
<p>Lokacija vozila: <b>${E(o.location)}</b></p>
${o.description ? `<p><i>${E(o.description)}</i></p>` : ''}
<p>Status: <span class="st">${E(o.status)}</span> <form class="inline" method="post" action="/admin/otkup/${o.id}">${[['nova', 'Nova'], ['kontaktiran', 'Kontaktiran'], ['zavrseno', 'Završeno']].map(([v, t]) => `<button name="status" value="${v}">${t}</button>`).join(' ')}</form></p></div>
${o.images ? `<h2>Slike (${o.images})</h2><div class="otimgs">${Array.from({ length: o.images }, (_, i) => `<a href="/admin/otkup/${o.id}/${i + 1}" target="_blank"><img src="/admin/otkup/${o.id}/${i + 1}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
</div>`;
  res.html(V.layout({ title: 'Otkup #' + o.id, path: '/admin', noindex: true, body }));
});
app.get('/admin/otkup/:id/:n', (req, res) => {
  if (!adminAuth(req, res)) return;
  const id = parseInt(req.params.id, 10), n = parseInt(req.params.n, 10);
  const f = path.join(OTKUP_DIR, `${id}-${n}.jpg`);
  if (!(id > 0 && n > 0) || !fs.existsSync(f)) return res.html('Nema slike', 404);
  res.setHeader('Content-Type', 'image/jpeg'); res.setHeader('Cache-Control', 'private, max-age=3600');
  res.end(fs.readFileSync(f));
});
app.post('/admin/otkup/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  if (!sameOrigin(req)) return res.html('Zabranjeno', 403);
  const status = ['nova', 'kontaktiran', 'zavrseno'].includes(req.body.status) ? req.body.status : null;
  if (status) db.prepare('UPDATE buyouts SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.redirect('/admin/otkup/' + (Number(req.params.id) || 0), 303);
});

app.post('/api/klik', (req, res) => {
  const b = req.body || {};
  if (limited(req, res, 60)) return;
  stats.click(req, String(b.k || ''), String(b.p || ''), String(b.t || ''));
  res.json({ ok: true });
});

const bar = (n, max) => `<span class="bar"><i style="width:${max ? Math.max(2, Math.round(n / max * 100)) : 0}%"></i></span>`;
app.get('/admin/statistika', (req, res) => {
  if (!adminAuth(req, res)) return;
  const d = [7, 30, 90].includes(Number(req.query.d)) ? Number(req.query.d) : 30;
  const r = stats.report(d);
  const E = V.esc, maxV = Math.max(1, ...r.daily.map(x => x.visitors));
  const tbl = (head, rows, empty) => `<table><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr>${rows.join('') || `<tr><td colspan="${head.length}">${empty}</td></tr>`}</table>`;
  const body = `<div class="admin"><h1>Statistika</h1>
<p><a href="/admin">← Admin</a> · Period: ${[7, 30, 90].map(x => x === d ? `<b>${x} dana</b>` : `<a href="/admin/statistika?d=${x}">${x} dana</a>`).join(' · ')}</p>
<div class="stcards"><div><b>${r.today.visitors}</b><span>posjetilaca danas</span></div><div><b>${r.tot.visitors}</b><span>posjetilaca (${d} dana)</span></div><div><b>${r.tot.views}</b><span>pregleda stranica</span></div><div><b>${r.searches}</b><span>pretraga</span></div></div>
<p class="muted small">Posjetilac se broji jednom dnevno (anonimni otisak, bez kolačića i bez čuvanja IP adrese). Botovi i admin se ne broje.</p>
<h2>Posjete po danima</h2>
${tbl(['Dan', 'Posjetilaca', 'Pregleda', ''], r.daily.slice().reverse().map(x => `<tr><td>${E(x.day)}</td><td>${x.visitors}</td><td>${x.views}</td><td>${bar(x.visitors, maxV)}</td></tr>`), 'Još nema posjeta.')}
<h2>Šta tražimo a nemamo (nula rezultata)</h2>
<p class="muted small">Ovo je lista za nabavku: pretrage koje nisu našle ništa, poredane po broju traženja.</p>
${tbl(['Traženo', 'Vozilo', 'Puta', 'Zadnji put'], r.missing.map(x => `<tr><td><b>${E(x.term || '—')}</b></td><td>${E(x.vehicle)}</td><td>${x.n}</td><td>${E(x.last)}</td></tr>`), 'Nema pretraga bez rezultata.')}
<h2>Najčešće pretrage</h2>
${tbl(['Pojam', 'Puta', 'Rezultata'], r.top.map(x => `<tr><td>${E(x.term)}</td><td>${x.n}</td><td>${x.maxres === 0 ? '<b style="color:var(--err)">0</b>' : x.maxres}</td></tr>`), 'Još nema pretraga.')}
<h2>Najtraženija vozila</h2>
${tbl(['Vozilo', 'Puta'], r.vehicles.map(x => `<tr><td>${E(x.vehicle)}</td><td>${x.n}</td></tr>`), 'Još nema podataka.')}
<h2>Najgledaniji artikli</h2>
${tbl(['Artikal', 'Pregleda'], r.parts.map(x => `<tr><td>${E(x.title)}</td><td>${x.n}</td></tr>`), 'Još nema podataka.')}
<h2>Klikovi na Viber / WhatsApp</h2>
${tbl(['Artikal', 'Viber', 'WhatsApp'], r.clicks.map(x => `<tr><td><a href="${E(x.path)}">${E(x.title || x.path)}</a></td><td>${x.vb}</td><td>${x.wa}</td></tr>`), 'Još nema klikova.')}
</div>`;
  res.html(V.layout({ title: 'Statistika', path: '/admin/statistika', noindex: true, body }));
});

app.get('/admin', (req, res) => {
  if (!adminAuth(req, res)) return;
  const buys = db.prepare('SELECT * FROM buyouts ORDER BY id DESC LIMIT 100').all();
  const st = (action, id, opts) => `<form class="inline" method="post" action="/admin/${action}/${id}">${opts.map(([v, t]) =>
    `<button name="status" value="${v}">${t}</button>`).join(' ')}</form>`;
  const s = sync.status;
  const body = `<div class="admin"><h1>Admin</h1>
<p><a class="btn" href="/admin/statistika">📊 Statistika posjeta i pretraga</a></p>
<p class="muted">Dijelova u shopu: <b>${db.prepare('SELECT COUNT(*) AS n FROM parts').get().n}</b> · zadnja provjera promjena: ${s.lastPoll ? fmtTs(s.lastPoll) : '—'} ·
 zadnje potpuno poravnanje: ${s.lastFull ? fmtTs(s.lastFull) : '—'}${s.lastError ? ` · <b style="color:var(--err)">greška: ${V.esc(s.lastError)}</b>` : ''}
 <form class="inline" method="post" action="/admin/sync"><button>Sinhroniziraj odmah</button></form></p>
<h2>Otkup vozila</h2>
<div class="otl">${buys.map(o => `<a class="otr${o.status === 'nova' ? ' new' : ''}" href="/admin/otkup/${o.id}">
<b>${V.esc(o.vehicle || 'Vozilo')}</b><span>${V.esc(o.name)} · ${V.esc(o.location)}</span><small>${fmtTs(o.created_at)}${o.images ? ' · 📷 ' + o.images : ''}</small><em class="st">${V.esc(o.status)}</em></a>`).join('') || '<p>Nema ponuda.</p>'}</div>
</div>`;
  res.html(V.layout({ title: 'Admin', path: '/admin', noindex: true, body }));
});

app.post('/admin/order/:id', async (req, res) => {
  if (!adminAuth(req, res)) return;
  if (!sameOrigin(req)) return res.html('Zabranjeno', 403);
  const status = ['nova', 'potvrdjena', 'zavrsena', 'otkazana'].includes(req.body.status) ? req.body.status : null;
  const o = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
  if (o && status) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, o.id);
    if (status === 'otkazana') { await appApi.release(o.ref); sync.poll(); }
    if (STANDALONE && status === 'zavrsena') for (const it of db.prepare('SELECT part_id FROM order_items WHERE order_id = ?').all(o.id)) sync.remove(it.part_id);
  }
  res.redirect('/admin', 303);
});
app.post('/admin/inquiry/:id', (req, res) => {
  if (!adminAuth(req, res)) return;
  if (!sameOrigin(req)) return res.html('Zabranjeno', 403);
  const status = ['novi', 'rijesen'].includes(req.body.status) ? req.body.status : null;
  if (status) db.prepare('UPDATE inquiries SET status = ? WHERE id = ?').run(status, Number(req.params.id));
  res.redirect('/admin', 303);
});
app.post('/admin/sync', (req, res) => {
  if (!adminAuth(req, res)) return;
  if (!sameOrigin(req)) return res.html('Zabranjeno', 403);
  sync.fullSync();
  res.redirect('/admin', 303);
});

// ---------- greške ----------
app.notFound = (req, res) => (req.path.startsWith('/api/') ? res.json({ error: 'nije pronađeno' }, 404) : res.html(V.notFound(), 404));
app.onError = (err, req, res, status) => (req.path.startsWith('/api/') ? res.json({ error: status === 500 ? 'interna greška' : err.message }, status)
  : res.html(V.layout({ title: 'Greška', noindex: true, body: '<div class="empty"><h1>Došlo je do greške</h1><p><a class="btn" href="/">Na početnu</a></p></div>' }), status));

if (cfg.adminPass && cfg.adminPass.length < 10) console.warn('[sigurnost] ADMIN_PASS je kratak — koristi bar 10 znakova');
app.listen(cfg.port, () => {
  console.log(`[shop] ${cfg.name} — http://localhost:${cfg.port}  (sqlite: ${db.driver}, sharp: ${sharp ? 'da' : 'ne'})`);
  sync.start();
});

process.on('unhandledRejection', e => console.error('[unhandledRejection]', e));
