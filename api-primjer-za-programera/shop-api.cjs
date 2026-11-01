'use strict';
/**
 * shop-api.cjs — API modul za webshop (delicauto.com)
 * Ide u AutoDelicGume aplikaciju. Ne mijenja nijednu postojeću tabelu ni kod aplikacije.
 *
 * Šta radi:
 *  - izlaže dijelove "na stanju" webshopu (samo javna polja, bez nabavnih cijena)
 *  - sam bilježi promjene (dodan / izmijenjen / prodan / obrisan dio) preko SQLite triggera,
 *    pa nije potrebno dirati ostale module aplikacije
 *  - čuva rezervacije kad neko naruči preko weba (da se isti dio ne proda dvaput)
 *
 * Aktivacija (u glavnom server fajlu, PRIJE autentifikacije i PRIJE app.get('*')):
 *    require('./shop-api.cjs')(app, db);          // CommonJS
 *    import shopApi from './shop-api.cjs'; shopApi(app, db);   // ESM
 *  i u .env aplikacije dodaj:  SHOP_API_KEY=neki-dugi-tajni-kljuc
 */
const crypto = require('crypto');

// =====================================================================
//  MAPIRANJE — jedino mjesto koje možda treba podesiti
//  Vrijednosti su SQL izrazi; tabela dijelova ima alias "d".
//  Ako neko polje ne postoji, stavi null (shop će ga preskočiti).
//  Pokreni `node inspect-schema.cjs putanja/do/baze.db` da vidiš prave nazive kolona.
// =====================================================================
const MAP = {
  table: 'dijelovi',
  idColumn: 'id',
  fields: {
    internal: 'd.interna_sifra',   // Interna šifra (npr. 7CM2)
    type: 'd.tip_dijela',          // Tip dijela (npr. KUTIJA OSIGURACA)
    group: 'd.grupa',
    make: 'd.marka',
    model: 'd.model',
    vehicle: 'd.vozilo',           // npr. "3.0 Dizel"
    catalog: 'd.kataloski_broj',
    side: 'd.strana',
    fuel: 'd.gorivo',
    displacement: 'd.kubikaza',
    power: 'd.snaga',
    engineCode: 'd.kod_motora',
    gearboxCode: 'd.kod_mjenjaca',
    gearbox: 'd.mjenjac',
    gears: 'd.broj_brzina',
    body: 'd.tip_karoserije',
    drive: 'd.pogon',
    note: 'd.napomena',
    price: 'd.cijena',             // prazno ili 0 => shop prikazuje "Pošalji upit"
    qty: 'd.kolicina',             // ako nemaš količinu: '1'
    images: 'd.slike',             // jedna kolona: JSON niz ili lista odvojena zarezom
  },
  inStock: 'd.kolicina > 0',       // uslov "Na stanju"
  // Ako su slike u posebnoj tabeli, popuni (? = id dijela) i dodaj tabelu u extraTriggerTables:
  imagesSql: null,                 // npr. 'SELECT putanja FROM slike_dijelova WHERE dio_id = ? ORDER BY id'
  extraTriggerTables: [],          // npr. [{ table: 'slike_dijelova', partIdColumn: 'dio_id' }]
  reservationDays: 14,
};

const SAFE_ID = /^[A-Za-z0-9_]+$/;

module.exports = function installShopApi(app, db, overrides) {
  const M = Object.assign({}, MAP, overrides || {});
  M.fields = Object.assign({}, MAP.fields, (overrides && overrides.fields) || {});
  const log = (...a) => console.log('[shop-api]', ...a);
  const warn = (...a) => console.warn('[shop-api]', ...a);

  if (!SAFE_ID.test(M.table) || !SAFE_ID.test(M.idColumn)) throw new Error('shop-api: neispravan naziv tabele/kolone');

  // ---------- pomoćne ----------
  const all = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const nowSec = () => Math.floor(Date.now() / 1000);

  // ---------- provjera mapiranja (svako polje posebno) ----------
  let enabled = true;
  const problems = [];
  const exprs = {};
  try { one(`SELECT 1 FROM "${M.table}" d LIMIT 1`); }
  catch (e) { enabled = false; problems.push(`tabela "${M.table}": ${e.message}`); }

  if (enabled) {
    for (const [k, expr] of Object.entries(M.fields)) {
      if (!expr) { exprs[k] = 'NULL'; continue; }
      try { one(`SELECT ${expr} FROM "${M.table}" d LIMIT 1`); exprs[k] = expr; }
      catch (e) {
        exprs[k] = k === 'qty' ? '1' : 'NULL';
        problems.push(`polje "${k}" (${expr}): ${e.message} -> preskočeno`);
      }
    }
    try { one(`SELECT 1 FROM "${M.table}" d WHERE ${M.inStock} LIMIT 1`); }
    catch (e) { enabled = false; problems.push(`uslov inStock (${M.inStock}): ${e.message}`); }
  }
  if (problems.length) {
    warn('PROBLEMI S MAPIRANJEM:\n  - ' + problems.join('\n  - ') +
      '\n  Pokreni: node inspect-schema.cjs <putanja-do-baze.db> i prilagodi MAP u shop-api.cjs');
  }

  // ---------- vlastite tabele i triggeri ----------
  if (enabled) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_changes (seq INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER, at INTEGER);
      CREATE TABLE IF NOT EXISTS shop_reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER NOT NULL, qty INTEGER NOT NULL DEFAULT 1,
        order_ref TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL,
        UNIQUE(order_ref, part_id));
      CREATE INDEX IF NOT EXISTS idx_shop_res_part ON shop_reservations(part_id);
    `);
    const t = M.table, id = M.idColumn;
    const mk = (name, ev, tbl, ref) => db.exec(
      `CREATE TRIGGER IF NOT EXISTS ${name} AFTER ${ev} ON "${tbl}" BEGIN ` +
      `INSERT INTO shop_changes(part_id, at) VALUES (${ref}, strftime('%s','now')); END;`);
    mk('shop_t_ins', 'INSERT', t, `NEW."${id}"`);
    mk('shop_t_upd', 'UPDATE', t, `NEW."${id}"`);
    mk('shop_t_del', 'DELETE', t, `OLD."${id}"`);
    mk('shop_r_ins', 'INSERT', 'shop_reservations', 'NEW.part_id');
    mk('shop_r_del', 'DELETE', 'shop_reservations', 'OLD.part_id');
    for (const x of M.extraTriggerTables || []) {
      if (!SAFE_ID.test(x.table) || !SAFE_ID.test(x.partIdColumn)) continue;
      const n = 'shop_x_' + x.table;
      mk(n + '_i', 'INSERT', x.table, `NEW."${x.partIdColumn}"`);
      mk(n + '_u', 'UPDATE', x.table, `NEW."${x.partIdColumn}"`);
      mk(n + '_d', 'DELETE', x.table, `OLD."${x.partIdColumn}"`);
    }
    log(`aktivno: tabela "${M.table}", ${problems.length ? problems.length + ' upozorenja' : 'mapiranje u redu'}`);
  }

  // ---------- upit za dio ----------
  const cols = Object.keys(M.fields).map(k => `${exprs[k] || 'NULL'} AS "${k}"`).join(', ');
  const BASE = () => `SELECT d."${M.idColumn}" AS id, ${cols}, ` +
    `CASE WHEN (${M.inStock}) THEN 1 ELSE 0 END AS in_stock, ` +
    `COALESCE((SELECT SUM(r.qty) FROM shop_reservations r WHERE r.part_id = d."${M.idColumn}" AND r.expires_at > ?), 0) AS reserved ` +
    `FROM "${M.table}" d`;

  const str = v => { if (v === null || v === undefined) return null; const s = String(v).trim(); return s === '' ? null : s; };
  const cleanImg = f => String(f).trim().replace(/^\/+/, '').replace(/^(public\/)?uploads\//, '');

  function parseImages(raw) {
    if (raw === null || raw === undefined) return [];
    let list = [];
    const s = String(raw).trim();
    if (!s) return [];
    if (s[0] === '[') { try { list = JSON.parse(s); } catch { list = []; } }
    else list = s.split(/[,;|\n]/);
    return list.map(x => (typeof x === 'object' && x ? (x.path || x.file || x.url || '') : x))
      .map(x => cleanImg(x)).filter(x => x && !x.includes('..'));
  }

  function shape(row) {
    const qty = Number.isFinite(Number(row.qty)) && Number(row.qty) > 0 ? Math.floor(Number(row.qty)) : 1;
    const reserved = Number(row.reserved) || 0;
    const available = row.in_stock === 1 && qty - reserved > 0;
    let images = parseImages(row.images);
    if (M.imagesSql) {
      try { images = all(M.imagesSql, row.id).map(r => cleanImg(Object.values(r)[0])).filter(Boolean); } catch { /* ostavi */ }
    }
    const price = Number(String(row.price ?? '').replace(',', '.'));
    return {
      id: row.id, available, qty: Math.max(0, qty - reserved),
      internal: str(row.internal), type: str(row.type), group: str(row.group),
      make: str(row.make), model: str(row.model), vehicle: str(row.vehicle),
      catalog: str(row.catalog), side: str(row.side), fuel: str(row.fuel),
      displacement: str(row.displacement), power: str(row.power),
      engineCode: str(row.engineCode), gearboxCode: str(row.gearboxCode),
      gearbox: str(row.gearbox), gears: str(row.gears), body: str(row.body), drive: str(row.drive),
      note: str(row.note), price: Number.isFinite(price) && price > 0 ? Math.round(price * 100) / 100 : null,
      images,
    };
  }

  // ---------- HTTP (običan middleware, radi s Expressom i bez njega) ----------
  const send = (res, status, obj) => {
    const body = JSON.stringify(obj);
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.end(body);
  };

  const keyOk = (req) => {
    const want = process.env.SHOP_API_KEY || '';
    if (!want) return null;
    const got = String(req.headers['x-api-key'] || '');
    const a = crypto.createHash('sha256').update(got).digest();
    const b = crypto.createHash('sha256').update(want).digest();
    return crypto.timingSafeEqual(a, b);
  };

  const readBody = (req) => new Promise((resolve, reject) => {
    if (req.body && typeof req.body === 'object') return resolve(req.body);
    let data = '';
    req.on('data', c => { data += c; if (data.length > 100000) { reject(new Error('prevelik zahtjev')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

  function sweepExpired() {
    try { run('DELETE FROM shop_reservations WHERE expires_at <= ?', nowSec()); } catch (e) { warn('sweep:', e.message); }
  }

  function reserve(partId, qty, orderRef) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const now = nowSec();
      const row = one(BASE() + ` WHERE d."${M.idColumn}" = ?`, now, partId);
      if (!row) { db.exec('ROLLBACK'); return { ok: false, reason: 'ne postoji' }; }
      const ex = one('SELECT qty FROM shop_reservations WHERE order_ref = ? AND part_id = ?', orderRef, partId);
      if (ex) { db.exec('COMMIT'); return { ok: true, already: true }; }
      const p = shape(row);
      if (!p.available) { db.exec('ROLLBACK'); return { ok: false, reason: 'nije na stanju' }; }
      if (qty > p.qty) { db.exec('ROLLBACK'); return { ok: false, reason: 'nedovoljna količina', available: p.qty }; }
      run('INSERT INTO shop_reservations(part_id, qty, order_ref, created_at, expires_at) VALUES (?,?,?,?,?)',
        partId, qty, orderRef, now, now + M.reservationDays * 86400);
      db.exec('COMMIT');
      return { ok: true };
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* već zatvoreno */ }
      throw e;
    }
  }

  const handler = async (req, res, next) => {
    const url = new URL(req.url, 'http://x');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const q = url.searchParams;
    try {
      const ok = keyOk(req);
      if (ok === null) return send(res, 503, { error: 'SHOP_API_KEY nije postavljen u .env aplikacije' });
      if (!ok) return send(res, 401, { error: 'neispravan API ključ' });
      if (!enabled) return send(res, 503, { error: 'mapiranje nije ispravno', problems });

      if (req.method === 'GET' && path === '/health') {
        sweepExpired();
        const seq = one(`SELECT seq FROM sqlite_sequence WHERE name = 'shop_changes'`);
        const inStock = one(`SELECT COUNT(*) AS n FROM "${M.table}" d WHERE ${M.inStock}`).n;
        return send(res, 200, { ok: true, seq: seq ? seq.seq : 0, inStock, problems });
      }

      if (req.method === 'GET' && path === '/parts') {
        const after = Math.max(0, parseInt(q.get('after'), 10) || 0);
        const limit = Math.min(1000, Math.max(1, parseInt(q.get('limit'), 10) || 500));
        const rows = all(BASE() + ` WHERE d."${M.idColumn}" > ? AND (${M.inStock}) ORDER BY d."${M.idColumn}" LIMIT ?`, nowSec(), after, limit);
        const items = rows.map(shape).filter(p => p.available);
        const next = rows.length === limit ? rows[rows.length - 1].id : null;
        return send(res, 200, { items, next });
      }

      let m;
      if (req.method === 'GET' && (m = path.match(/^\/parts\/(\d+)$/))) {
        const row = one(BASE() + ` WHERE d."${M.idColumn}" = ?`, nowSec(), Number(m[1]));
        if (!row) return send(res, 200, { id: Number(m[1]), available: false });
        return send(res, 200, shape(row));
      }

      if (req.method === 'GET' && path === '/changes') {
        sweepExpired();
        const since = Math.max(0, parseInt(q.get('since'), 10) || 0);
        const s = one(`SELECT seq FROM sqlite_sequence WHERE name = 'shop_changes'`);
        const seq = s ? s.seq : 0;
        if (since > seq) return send(res, 200, { seq, reset: true, ids: [] });
        const rows = all('SELECT DISTINCT part_id FROM shop_changes WHERE seq > ? LIMIT 1001', since);
        if (rows.length > 1000) return send(res, 200, { seq, full: true, ids: [] });
        run('DELETE FROM shop_changes WHERE at < ?', nowSec() - 30 * 86400);
        return send(res, 200, { seq, ids: rows.map(r => r.part_id) });
      }

      if (req.method === 'POST' && path === '/reserve') {
        const b = await readBody(req);
        const partId = parseInt(b.partId, 10), qty = parseInt(b.qty, 10) || 1, ref = String(b.orderRef || '').slice(0, 40);
        if (!partId || !ref || qty < 1 || qty > 50) return send(res, 400, { ok: false, reason: 'neispravni podaci' });
        const r = reserve(partId, qty, ref);
        return send(res, r.ok ? 200 : 409, r);
      }

      if (req.method === 'POST' && path === '/release') {
        const b = await readBody(req);
        const ref = String(b.orderRef || '').slice(0, 40);
        if (!ref) return send(res, 400, { ok: false });
        const r = run('DELETE FROM shop_reservations WHERE order_ref = ?', ref);
        return send(res, 200, { ok: true, released: r.changes });
      }

      return typeof next === 'function' ? next() : send(res, 404, { error: 'nepoznata ruta' });
    } catch (e) {
      warn('greška:', e.message);
      return send(res, 500, { error: 'interna greška' });
    }
  };

  if (app && typeof app.use === 'function') app.use('/shop-api', handler);
  return { handler, enabled, problems };
};
