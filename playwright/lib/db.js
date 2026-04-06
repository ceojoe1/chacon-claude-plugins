import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.resolve(__dirname, '../../travel_plans/vacai.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA journal_mode = WAL');
  _db.exec('PRAGMA foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trips (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slug        TEXT    NOT NULL,
      destination TEXT    NOT NULL,
      origin      TEXT    NOT NULL DEFAULT '',
      depart      TEXT    NOT NULL,
      return      TEXT    NOT NULL,
      travelers   INTEGER NOT NULL,
      rooms       INTEGER NOT NULL DEFAULT 0,
      UNIQUE (slug, origin, depart, return, travelers, rooms)
    );

    CREATE TABLE IF NOT EXISTS searches (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id     INTEGER NOT NULL REFERENCES trips(id),
      category    TEXT    NOT NULL,
      searched_at TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS flight_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id   INTEGER NOT NULL REFERENCES searches(id),
      site        TEXT,
      airline     TEXT,
      route       TEXT,
      stops       TEXT,
      per_person  TEXT,
      total       TEXT,
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS hotel_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id   INTEGER NOT NULL REFERENCES searches(id),
      site        TEXT,
      property    TEXT,
      type        TEXT,
      rating      TEXT,
      per_night   TEXT,
      total       TEXT,
      notes       TEXT,
      error       TEXT
    );

    CREATE TABLE IF NOT EXISTS package_results (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      search_id   INTEGER NOT NULL REFERENCES searches(id),
      site        TEXT,
      package_name TEXT,
      flight_cost TEXT,
      hotel_cost  TEXT,
      per_person  TEXT,
      total       TEXT,
      error       TEXT
    );
  `);
}

function upsertTrip(db, params) {
  const origin = params.origin || '';
  const rooms = params.rooms || 0;
  db.prepare(
    'INSERT OR IGNORE INTO trips (slug, destination, origin, depart, return, travelers, rooms) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(params.slug, params.destination, origin, params.depart, params.return, params.travelers, rooms);
  return db.prepare(
    'SELECT id FROM trips WHERE slug=? AND origin=? AND depart=? AND return=? AND travelers=? AND rooms=?'
  ).get(params.slug, origin, params.depart, params.return, params.travelers, rooms).id;
}

function insertSearch(db, tripId, category) {
  const result = db.prepare(
    'INSERT INTO searches (trip_id, category, searched_at) VALUES (?, ?, ?)'
  ).run(tripId, category, new Date().toISOString());
  return result.lastInsertRowid;
}

function insertFlightResults(db, searchId, results) {
  const stmt = db.prepare(
    'INSERT INTO flight_results (search_id, site, airline, route, stops, per_person, total, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const r of results) {
    stmt.run(searchId, r.site || null, r.airline || null, r.route || null, r.stops || null, r.perPerson || null, r.total || null, r.error || null);
  }
}

function insertHotelResults(db, searchId, results) {
  const stmt = db.prepare(
    'INSERT INTO hotel_results (search_id, site, property, type, rating, per_night, total, notes, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const r of results) {
    stmt.run(searchId, r.site || null, r.property || null, r.type || null, r.rating || null, r.perNight || null, r.total || null, r.notes || null, r.error || null);
  }
}

function insertPackageResults(db, searchId, results) {
  const stmt = db.prepare(
    'INSERT INTO package_results (search_id, site, package_name, flight_cost, hotel_cost, per_person, total, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  for (const r of results) {
    stmt.run(searchId, r.site || null, r.packageName || null, r.flightCost || null, r.hotelCost || null, r.perPerson || null, r.total || null, r.error || null);
  }
}

export function saveSearch({ params, results }) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    const tripId = upsertTrip(db, params);
    const searchId = insertSearch(db, tripId, params.category);
    if (params.category === 'flights') insertFlightResults(db, searchId, results);
    else if (params.category === 'hotels') insertHotelResults(db, searchId, results);
    else insertPackageResults(db, searchId, results);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
