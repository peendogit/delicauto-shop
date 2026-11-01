'use strict';
const crypto = require('crypto');

// Vlastita, privatna statistika: bez kolačića i bez čuvanja IP adrese (samo dnevni anonimni otisak).
const BOT = /bot|crawl|spider|slurp|bing|facebookexternalhit|preview|monitor|curl|wget|python|node-fetch|go-http|headless|lighthouse|uptime/i;
const SKIP = /^\/(admin|static|img|api|health|sw\.js|manifest|favicon|robots|sitemap|offline)/;

function makeStats(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS st_day (day TEXT, vid TEXT, views INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, vid));
    CREATE TABLE IF NOT EXISTS st_search (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, day TEXT, kind TEXT, term TEXT, vehicle TEXT, results INTEGER);
    CREATE INDEX IF NOT EXISTS st_search_day ON st_search(day);
    CREATE TABLE IF NOT EXISTS st_view (day TEXT, part_id INTEGER, title TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, part_id));
    CREATE TABLE IF NOT EXISTS st_click (day TEXT, kind TEXT, path TEXT, title TEXT, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, kind, path));
  `);
  const salt = (db.prepare("SELECT value FROM sync_state WHERE key = 'stat_salt'").get() || {}).value
    || (() => { const s = crypto.randomBytes(16).toString('hex'); db.prepare("INSERT OR REPLACE INTO sync_state(key, value) VALUES ('stat_salt', ?)").run(s); return s; })();
  const dayOf = (t = Date.now()) => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Sarajevo' });
  const vidOf = req => crypto.createHash('sha256').update(salt + dayOf() + req.ip + String(req.headers['user-agent'] || '')).digest('hex').slice(0, 16);
  const isBot = req => BOT.test(String(req.headers['user-agent'] || '')) || !req.headers['user-agent'];

  const upView = db.prepare('INSERT INTO st_day(day, vid, views) VALUES (?,?,1) ON CONFLICT(day, vid) DO UPDATE SET views = views + 1');
  // middleware: broji prikaze HTML stranica (ne botove, ne admin)
  function middleware(req, res) {
    if (req.method !== 'GET' || SKIP.test(req.path) || isBot(req) || req.query.frag) return;
    res.on('finish', () => {
      try { if (res.statusCode === 200 && String(res.getHeader('content-type') || '').startsWith('text/html')) upView.run(dayOf(), vidOf(req)); } catch { /* statistika ne smije rušiti shop */ }
    });
  }

  // pretrage: čeka 3,5 s mirovanja da se ne zabilježi svako slovo ("po", "pol", "polu…")
  const pending = new Map();
  const insSearch = db.prepare('INSERT INTO st_search(ts, day, kind, term, vehicle, results) VALUES (?,?,?,?,?,?)');
  function search(req, { kind = 'dio', term = '', vehicle = '', results = 0 }) {
    if (isBot(req)) return;
    term = String(term || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    vehicle = String(vehicle || '').trim().slice(0, 80);
    if (!term && !vehicle) return;
    const vid = vidOf(req), old = pending.get(vid);
    if (old) clearTimeout(old.timer);
    const rec = { kind, term, vehicle, results };
    rec.timer = setTimeout(() => {
      pending.delete(vid);
      try { insSearch.run(Date.now(), dayOf(), rec.kind, rec.term, rec.vehicle, rec.results); } catch { /* ignoriši */ }
    }, 3500);
    rec.timer.unref();
    pending.set(vid, rec);
  }

  const upPart = db.prepare('INSERT INTO st_view(day, part_id, title, n) VALUES (?,?,?,1) ON CONFLICT(day, part_id) DO UPDATE SET n = n + 1, title = excluded.title');
  function partView(req, id, title) { if (!isBot(req)) try { upPart.run(dayOf(), id, String(title).slice(0, 120)); } catch { /* */ } }

  const upClick = db.prepare('INSERT INTO st_click(day, kind, path, title, n) VALUES (?,?,?,?,1) ON CONFLICT(day, kind, path) DO UPDATE SET n = n + 1');
  function click(req, kind, p, title) {
    if (isBot(req) || !['viber', 'whatsapp'].includes(kind) || !/^\/(dio|felna)\//.test(p)) return;
    try { upClick.run(dayOf(), kind, p.slice(0, 200), String(title || '').slice(0, 120)); } catch { /* */ }
  }

  function cleanup() {
    const cut = dayOf(Date.now() - 400 * 864e5);
    for (const t of ['st_day', 'st_search', 'st_view', 'st_click']) db.prepare(`DELETE FROM ${t} WHERE day < ?`).run(cut);
  }
  cleanup(); setInterval(cleanup, 24 * 3600 * 1000).unref();

  function report(days) {
    const since = dayOf(Date.now() - (days - 1) * 864e5);
    const q = (sql, ...a) => db.prepare(sql).all(...a);
    const daily = q('SELECT day, COUNT(*) AS visitors, SUM(views) AS views FROM st_day WHERE day >= ? GROUP BY day ORDER BY day', since);
    const tot = q('SELECT COUNT(*) AS visitors, COALESCE(SUM(views),0) AS views FROM st_day WHERE day >= ?', since)[0];
    const today = q('SELECT COUNT(*) AS visitors, COALESCE(SUM(views),0) AS views FROM st_day WHERE day = ?', dayOf())[0];
    const top = q(`SELECT term, COUNT(*) AS n, MAX(results) AS maxres, MIN(results) AS minres FROM st_search WHERE day >= ? AND term <> '' GROUP BY term ORDER BY n DESC, term LIMIT 30`, since);
    const missing = q(`SELECT term, vehicle, COUNT(*) AS n, MAX(day) AS last FROM st_search WHERE day >= ? AND results = 0 GROUP BY term, vehicle ORDER BY n DESC, last DESC LIMIT 40`, since);
    const vehicles = q(`SELECT vehicle, COUNT(*) AS n FROM st_search WHERE day >= ? AND vehicle <> '' GROUP BY vehicle ORDER BY n DESC LIMIT 20`, since);
    const parts = q('SELECT part_id, title, SUM(n) AS n FROM st_view WHERE day >= ? GROUP BY part_id ORDER BY n DESC LIMIT 20', since);
    const clicks = q('SELECT path, title, SUM(n) AS n, SUM(CASE WHEN kind = \'viber\' THEN n ELSE 0 END) AS vb, SUM(CASE WHEN kind = \'whatsapp\' THEN n ELSE 0 END) AS wa FROM st_click WHERE day >= ? GROUP BY path ORDER BY n DESC LIMIT 20', since);
    const searches = q('SELECT COUNT(*) AS n FROM st_search WHERE day >= ?', since)[0].n;
    return { days, daily, tot, today, top, missing, vehicles, parts, clicks, searches, since };
  }
  return { middleware, search, partView, click, report, dayOf };
}
module.exports = { makeStats };
