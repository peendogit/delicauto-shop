'use strict';
// Uvoz dijelova iz SQL backupa aplikacije (MariaDB dump, .sql ili .sql.gz) u shop.
//   node tools/import-dump.js /putanja/backup.sql.gz
// Uvozi samo dijelove NA STANJU (status UNSOLD, aktivni, nije obrisan). Lozinke i korisnici iz backupa se ne čitaju.
// Slike: u bazi su samo ID-evi priloga; ime fajla se pravi prema IMG_PATTERN (.env), npr. "{id}.jpg" ili "{p2}/{id}.jpg".
const fs = require('fs');
const zlib = require('zlib');
const readline = require('readline');
const cfg = require('../lib/config');
const dbm = require('../lib/db');
const { makeSync } = require('../lib/sync');

const file = process.argv[2];
if (!file || !fs.existsSync(file)) { console.error('Upotreba: node tools/import-dump.js backup.sql.gz'); process.exit(1); }
const IMG_PATTERN = process.env.IMG_PATTERN || '{id}.jpg';
const MAX_IMAGES = 8;
const WANT = new Set(['spare_part', 'spare_part_type', 'spare_part_group', 'car_make', 'car_model', 'lib_attachment']);

// ---- parser MySQL INSERT redova ----
function parseValues(s, i) {
  const rows = []; const n = s.length;
  while (i < n) {
    while (i < n && ' ,\n\r'.includes(s[i])) i++;
    if (i >= n || s[i] === ';') break;
    if (s[i] !== '(') throw new Error('neočekivan znak u dump-u: ' + s.slice(i, i + 30));
    i++; const row = [];
    for (;;) {
      if (s[i] === "'") {
        i++; let out = '';
        for (;;) {
          let j = i;
          while (j < n && s[j] !== '\\' && s[j] !== "'") j++;
          out += s.slice(i, j); i = j;
          if (s[i] === '\\') { const e = s[i + 1]; out += ({ n: '\n', r: '\r', t: '\t', 0: '\0', Z: '\x1a' })[e] ?? e; i += 2; }
          else if (s[i + 1] === "'") { out += "'"; i += 2; }
          else { i++; break; }
        }
        row.push(out);
      } else {
        let j = i; while (s[j] !== ',' && s[j] !== ')') j++;
        const t = s.slice(i, j); i = j;
        row.push(t === 'NULL' ? null : Number(t));
      }
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ')') { i++; break; }
    }
    rows.push(row);
  }
  return rows;
}

const MAP = {
  fuel: { DIESEL: 'Dizel', PETROL: 'Benzin', HYBRID: 'Hibrid', ELECTRIC: 'Električni', LPG: 'Plin' },
  side: { LEFT: 'Lijeva', RIGHT: 'Desna', FRONT: 'Prednja', BACK: 'Zadnja', CENTRAL: 'Središnja', FRONT_LEFT: 'Prednja lijeva', FRONT_RIGHT: 'Prednja desna', BACK_LEFT: 'Zadnja lijeva', BACK_RIGHT: 'Zadnja desna' },
  gearbox: { MANUAL: 'Manuelni', AUTOMATIC: 'Automatik' },
  drive: { FWD: 'Prednji', RWD: 'Zadnji', AWD: '4x4' },
  body: { LIMOUSINE: 'Limuzina', SUV: 'SUV', CARAVAN: 'Karavan', COUPE: 'Coupe', VAN: 'Van', CABRIO: 'Kabriolet', HATCHBACK: 'Hatchback' },
};
const yy = d => (d ? String(d).slice(2, 4) : '');

(async () => {
  const cols = {}; const data = {}; let cur = null;
  const input = file.endsWith('.gz') ? fs.createReadStream(file).pipe(zlib.createGunzip()) : fs.createReadStream(file);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    let m = /^CREATE TABLE `(\w+)`/.exec(line);
    if (m) { cur = m[1]; cols[cur] = []; continue; }
    if (cur && line.startsWith('  `')) { cols[cur].push(/^  `(\w+)`/.exec(line)[1]); continue; }
    if (line.startsWith(') ENGINE')) { cur = null; continue; }
    m = /^INSERT INTO `(\w+)` VALUES /.exec(line);
    if (m && WANT.has(m[1])) {
      const t = m[1]; const c = cols[t];
      const list = data[t] || (data[t] = []);
      for (const r of parseValues(line, m[0].length)) { const o = {}; c.forEach((k, i) => { o[k] = r[i]; }); list.push(o); }
    }
  }
  for (const t of WANT) if (!data[t]) { console.error(`U backupu nema tabele ${t}. Je li ovo pravi backup?`); process.exit(1); }
  console.log('Pročitano:', Object.entries(data).map(([k, v]) => `${k} ${v.length}`).join(', '));

  const byId = list => new Map(list.map(x => [x.id, x]));
  const groups = byId(data.spare_part_group), types = byId(data.spare_part_type), makes = byId(data.car_make), models = byId(data.car_model);
  const imgs = new Map();
  for (const a of data.lib_attachment) {
    if (a.type !== 'SPARE_PART' || a.active !== 1 || a.deleted_date) continue;
    (imgs.get(a.object_id) || imgs.set(a.object_id, []).get(a.object_id)).push(a);
  }
  const imgName = id => IMG_PATTERN.replace('{id}', id).replace('{p2}', id.slice(0, 2)).replace('{p4}', id.slice(0, 4));
  const stableId = u => parseInt(u.replace(/-/g, '').slice(0, 12), 16);

  const db = dbm.open(cfg.dataDir);
  const sync = makeSync({ db, app: null, pollSeconds: 3600 });
  const seen = new Set(); let n = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    db.exec('DELETE FROM parts; DELETE FROM parts_fts;');
    for (const p of data.spare_part) {
      if (p.status !== 'UNSOLD' || p.active !== 1 || p.deleted_date) continue;
      const t = types.get(p.type_id), g = t && groups.get(t.group_id), mk = makes.get(p.make_id), mo = models.get(p.model_id);
      if (!t) { skipped++; continue; }
      const id = stableId(p.id);
      if (seen.has(id)) { skipped++; console.warn('Sudar ID-a, preskačem', p.id); continue; }
      seen.add(id);
      const model = mo ? [mo.name, mo.generation_name].filter(Boolean).join(' ') : null;
      const years = mo && mo.date_from ? ` (${yy(mo.date_from)}-${yy(mo.date_to)})` : '';
      const eng = p.cylinder_capacity ? (p.cylinder_capacity / 1000).toFixed(1) : '';
      const pics = (imgs.get(p.id) || []).sort((a, b) => b.main_picture - a.main_picture).slice(0, MAX_IMAGES).map(a => imgName(a.id));
      sync.applyItem({
        id, available: true, qty: 1,
        internal: p.internal_code, type: String(t.title).trim(), group: g ? g.title : null,
        make: mk ? mk.name : null, model, vehicle: model ? `${model}${years}` : null,
        catalog: p.catalog_number || p.catalog_number_manufacturer || null,
        side: MAP.side[p.side] || null, fuel: MAP.fuel[p.fuel_type] || null,
        displacement: p.cylinder_capacity ? String(Math.round(p.cylinder_capacity)) : null, power: p.power ? String(p.power) : null,
        engineCode: p.engine_code, gearboxCode: p.gearbox_code, gearbox: MAP.gearbox[p.gearbox_type] || null,
        gears: p.gearbox_speed ? String(p.gearbox_speed) : null, body: MAP.body[p.vehicle_type] || p.vehicle_type || null,
        drive: MAP.drive[p.drive_train] || null, note: p.note ? String(p.note).trim() : null,
        price: p.price > 0 ? p.price : null, images: pics,
      });
      n++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  const s = db.prepare('SELECT COUNT(*) c, SUM(price>0) pr, SUM(images!=\'[]\') im FROM parts').get();
  console.log(`Uvezeno ${n} dijelova (preskočeno ${skipped}). Sa cijenom: ${s.pr}, sa slikom: ${s.im}.`);
  console.log('Primjer imena slike:', JSON.parse(db.prepare("SELECT images FROM parts WHERE images!='[]' LIMIT 1").get().images)[0]);
})().catch(e => { console.error(e); process.exit(1); });
