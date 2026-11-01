'use strict';
// Otvara SQLite: better-sqlite3 ako je instaliran, inače ugrađeni node:sqlite (Node 22.5+).
// Oba imaju isti oblik koji koristimo: exec, prepare().all/get/run (samo pozicioni parametri).
module.exports = function openSqlite(file) {
  let db, driver;
  try {
    const Better = require('better-sqlite3');
    db = new Better(file);
    driver = 'better-sqlite3';
  } catch {
    try {
      const { DatabaseSync } = require('node:sqlite');
      db = new DatabaseSync(file);
      driver = 'node:sqlite';
    } catch {
      throw new Error('Nema SQLite drivera. Pokreni "npm install" (better-sqlite3) ili koristi Node 22.5+.');
    }
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
  db.driver = driver;
  return db;
};
