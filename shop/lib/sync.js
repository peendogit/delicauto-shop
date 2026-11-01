'use strict';
const { getState, setState } = require('./db');

const normCatalog = s => String(s || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

// Sinhronizacija: shop drži kopiju dijelova "na stanju" (brza pretraga), a aplikacija ostaje izvor istine.
//  - svakih N sekundi pita aplikaciju šta se promijenilo (dodano/prodano/izmijenjeno) i osvježi samo to
//  - jednom dnevno (i pri prvom pokretanju) radi potpuno poravnanje
function makeSync({ db, app, pollSeconds, onChange }) {
  const status = { lastPoll: null, lastFull: null, lastError: null, running: false, lastCount: 0 };

  const ins = db.prepare(`INSERT OR REPLACE INTO parts
    (id, internal, type, grp, make, model, vehicle, catalog, catalog_norm, side, fuel, displacement, power, engine_code, gearbox_code,
     gearbox, gears, body, drive, note, price, qty, images, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const insFts = db.prepare(`INSERT INTO parts_fts(rowid, type, make, model, vehicle, catalog, catalog_norm, internal, engine_code)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  const delPart = db.prepare('DELETE FROM parts WHERE id = ?');
  const delFts = db.prepare('DELETE FROM parts_fts WHERE rowid = ?');

  const n = v => (v === undefined ? null : v);

  function remove(id) { delFts.run(id); delPart.run(id); if (onChange) onChange(); }

  function store(p) {
    if (onChange) onChange();
    delFts.run(p.id);
    ins.run(p.id, n(p.internal), n(p.type), n(p.group), n(p.make), n(p.model), n(p.vehicle), n(p.catalog), normCatalog(p.catalog), n(p.side), n(p.fuel),
      n(p.displacement), n(p.power), n(p.engineCode), n(p.gearboxCode), n(p.gearbox), n(p.gears), n(p.body), n(p.drive), n(p.note),
      n(p.price), p.qty || 1, JSON.stringify(p.images || []), Date.now());
    insFts.run(p.id, p.type || '', p.make || '', p.model || '', p.vehicle || '', p.catalog || '', normCatalog(p.catalog),
      p.internal || '', p.engineCode || '');
  }

  function applyItem(p) {
    if (!p || !p.id) return;
    if (!p.available || !(p.qty > 0)) remove(p.id); else store(p);
  }

  const tx = (fn) => { db.exec('BEGIN'); try { fn(); db.exec('COMMIT'); } catch (e) { try { db.exec('ROLLBACK'); } catch { /* */ } throw e; } };

  async function fullSync() {
    if (status.running) return;
    status.running = true;
    try {
      const h = await app.health();
      if (!h.ok) throw new Error('aplikacija nedostupna: ' + (h.error || h.status));
      const startSeq = h.data.seq;
      const seen = new Set();
      let after = 0;
      for (;;) {
        const r = await app.parts(after, 500);
        if (!r.ok) throw new Error('GET /parts: ' + (r.error || r.status));
        tx(() => { for (const p of r.data.items) { store(p); seen.add(p.id); } });
        if (!r.data.next) break;
        after = r.data.next;
      }
      tx(() => { for (const { id } of db.prepare('SELECT id FROM parts').all()) if (!seen.has(id)) remove(id); });
      setState(db, 'seq', startSeq);
      setState(db, 'last_full', Date.now());
      status.lastFull = Date.now(); status.lastError = null; status.lastCount = seen.size;
      console.log(`[sync] potpuna sinhronizacija: ${seen.size} dijelova`);
    } catch (e) {
      status.lastError = e.message; console.error('[sync] greška (potpuna):', e.message);
    } finally { status.running = false; }
  }

  async function poll() {
    if (status.running) return;
    status.running = true;
    let needFull = false;
    try {
      const since = Number(getState(db, 'seq') || 0);
      const r = await app.changes(since);
      status.lastPoll = Date.now();
      if (!r.ok) throw new Error('GET /changes: ' + (r.error || r.status));
      const d = r.data;
      if (d.reset || d.full) needFull = true;
      else {
        const ids = d.ids;
        for (let i = 0; i < ids.length; i += 8) {
          const batch = ids.slice(i, i + 8);
          const items = await Promise.all(batch.map(id => app.part(id)));
          if (items.some(x => !x.ok)) throw new Error('GET /parts/:id nije uspio');
          tx(() => items.forEach((x, k) => { if (x.data.id === undefined) remove(batch[k]); else applyItem(x.data); }));
        }
        setState(db, 'seq', d.seq);
        if (ids.length) console.log(`[sync] osvježeno ${ids.length} dijelova`);
      }
      status.lastError = null;
    } catch (e) {
      status.lastError = e.message; console.error('[sync] greška:', e.message);
    } finally { status.running = false; }
    if (needFull) await fullSync();
  }

  function start() {
    const first = !getState(db, 'seq') || db.prepare('SELECT COUNT(*) AS n FROM parts').get().n === 0;
    if (first) fullSync();
    setInterval(poll, pollSeconds * 1000).unref();
    setInterval(() => {
      const last = Number(getState(db, 'last_full') || 0);
      if (Date.now() - last > 24 * 3600 * 1000 && new Date().getHours() >= 3) fullSync();
    }, 3600 * 1000).unref();
  }

  return { start, poll, fullSync, applyItem, remove, status };
}

module.exports = { makeSync, normCatalog };
