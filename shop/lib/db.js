'use strict';
const fs = require('fs');
const path = require('path');
const openSqlite = require('./sqlite');

function open(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = openSqlite(path.join(dataDir, 'shop.db'));
  db.exec(`
    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY, internal TEXT, type TEXT, grp TEXT, make TEXT, model TEXT, vehicle TEXT,
      catalog TEXT, catalog_norm TEXT, side TEXT, fuel TEXT, displacement TEXT, power TEXT, engine_code TEXT, gearbox_code TEXT,
      gearbox TEXT, gears TEXT, body TEXT, drive TEXT, note TEXT,
      price REAL, qty INTEGER NOT NULL DEFAULT 1, images TEXT NOT NULL DEFAULT '[]', updated_at INTEGER);
    CREATE INDEX IF NOT EXISTS idx_parts_make_model ON parts(make, model);
    CREATE INDEX IF NOT EXISTS idx_parts_type ON parts(type);
    CREATE INDEX IF NOT EXISTS idx_parts_grp ON parts(grp);
    CREATE VIRTUAL TABLE IF NOT EXISTS parts_fts USING fts5(
      type, make, model, vehicle, catalog, catalog_norm, internal, engine_code,
      tokenize = 'unicode61 remove_diacritics 2');
    CREATE TABLE IF NOT EXISTS sync_state (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, ref TEXT UNIQUE NOT NULL, name TEXT, phone TEXT, email TEXT,
      city TEXT, address TEXT, delivery TEXT, note TEXT, total REAL, status TEXT NOT NULL DEFAULT 'nova', created_at INTEGER);
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, part_id INTEGER, title TEXT, internal TEXT,
      price REAL, qty INTEGER);
    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT, part_id INTEGER, part_title TEXT, name TEXT, phone TEXT, email TEXT,
      message TEXT, status TEXT NOT NULL DEFAULT 'novi', created_at INTEGER);
    CREATE TABLE IF NOT EXISTS rims (
      id INTEGER PRIMARY KEY, internal TEXT, type TEXT, diameter TEXT, width TEXT, bolts TEXT, et TEXT, center TEXT,
      make TEXT, model TEXT, damaged INTEGER, screws INTEGER, chrome INTEGER, note TEXT, price REAL,
      images TEXT NOT NULL DEFAULT '[]', updated_at INTEGER);
    CREATE TABLE IF NOT EXISTS yard_vehicles (
      id INTEGER PRIMARY KEY, make TEXT, model TEXT, year INTEGER, fuel TEXT, engine_code TEXT, body TEXT, code TEXT);
    CREATE TABLE IF NOT EXISTS buyouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, location TEXT, vehicle TEXT, description TEXT,
      images INTEGER NOT NULL DEFAULT 0, mailed INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'nova', created_at INTEGER);
  `);
  try { db.exec('ALTER TABLE parts ADD COLUMN catalog_norm TEXT'); } catch { /* kolona već postoji */ }
  return db;
}

const getState = (db, k) => { const r = db.prepare('SELECT value FROM sync_state WHERE key = ?').get(k); return r ? r.value : null; };
const setState = (db, k, v) => db.prepare('INSERT OR REPLACE INTO sync_state(key, value) VALUES (?, ?)').run(k, String(v));

module.exports = { open, getState, setState };
