'use strict';
/**
 * Ispisuje tabele i kolone SQLite baze (da se pravilno podesi MAP u shop-api.cjs).
 * Upotreba:  node inspect-schema.cjs putanja/do/baze.db
 * Ništa ne mijenja i ne ispisuje nikakve lozinke/hasheve.
 */
const path = process.argv[2];
if (!path) { console.log('Upotreba: node inspect-schema.cjs putanja/do/baze.db'); process.exit(1); }

let db;
try { const D = require('better-sqlite3'); db = new D(path, { readonly: true }); }
catch { const { DatabaseSync } = require('node:sqlite'); db = new DatabaseSync(path, { readOnly: true }); }

const SENSITIVE = /pass|lozink|hash|token|secret/i;
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
for (const { name } of tables) {
  let n = '?';
  try { n = db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n; } catch { /* virtualne tabele */ }
  const cols = db.prepare(`PRAGMA table_info("${name}")`).all();
  console.log(`\n== ${name}  (${n} redova)`);
  console.log('   ' + cols.map(c => `${c.name}:${c.type || '?'}`).join(', '));
  if (/dio|part|artik|stock|slik|image/i.test(name) && n > 0) {
    const row = db.prepare(`SELECT * FROM "${name}" LIMIT 1`).get();
    const safe = {};
    for (const [k, v] of Object.entries(row)) safe[k] = SENSITIVE.test(k) ? '***' : (typeof v === 'string' && v.length > 80 ? v.slice(0, 80) + '…' : v);
    console.log('   primjer:', JSON.stringify(safe));
  }
}
