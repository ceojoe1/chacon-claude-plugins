// SQLite layer for chacon-travel. Uses node:sqlite (built-in since Node 22.5+).
// Opens vacai.db inside DATA_DIR, runs the canonical schema once on first
// connection, exposes upsert helpers used by writer.js.

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './data-dir.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'mcp', 'schema.sql');
const DB_PATH = path.join(DATA_DIR, 'vacai.db');

let _db = null;

function openDb() {
  if (_db) return _db;
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  _db = new DatabaseSync(DB_PATH);
  _db.exec('PRAGMA foreign_keys = ON;');
  // Schema is idempotent (CREATE TABLE IF NOT EXISTS) — safe to run on every open.
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  _db.exec(schema);
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ── Trip + search upserts ────────────────────────────────────────────────────

/**
 * Insert or update a trip row keyed by (slug, depart, return, travelers, origin).
 * Returns the trip id.
 */
export function upsertTrip(params) {
  const db = openDb();
  const origin = params.origin || '';
  const existing = db.prepare(`
    SELECT id FROM trips
    WHERE slug = ? AND depart = ? AND return = ? AND travelers = ? AND origin = ?
    LIMIT 1
  `).get(params.slug, params.depart, params.return, params.travelers, origin);

  if (existing) {
    if (params.trip) {
      db.prepare(`
        UPDATE trips SET name = COALESCE(?, name), updated_at = datetime('now')
        WHERE id = ?
      `).run(params.trip || null, existing.id);
    }
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO trips (name, slug, destination, origin, depart, return, travelers, rooms)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.trip || null,
    params.slug,
    params.destination,
    origin,
    params.depart,
    params.return,
    params.travelers,
    params.rooms || 1
  );
  return Number(result.lastInsertRowid);
}

/**
 * Get-or-create a search row for (trip_id, category, today). Same-day re-runs
 * delete any prior child results so the new run replaces them. Returns the
 * search id.
 */
export function upsertSearchSnapshot({ tripId, category, sites, tripLabel, snapshotDate: overrideDate }) {
  const db = openDb();
  const snapshotDate = overrideDate || new Date().toISOString().slice(0, 10);

  const existing = db.prepare(`
    SELECT id FROM searches
    WHERE trip_id = ? AND category = ? AND snapshot_date = ?
    LIMIT 1
  `).get(tripId, category, snapshotDate);

  if (existing) {
    // Same-day re-run: clear stale child results, refresh searched_at.
    const childTable = childTableFor(category);
    db.prepare(`DELETE FROM ${childTable} WHERE search_id = ?`).run(existing.id);
    db.prepare(`
      UPDATE searches
      SET searched_at = datetime('now'), sites = ?, trip_label = COALESCE(?, trip_label)
      WHERE id = ?
    `).run(sites || null, tripLabel || null, existing.id);
    return existing.id;
  }

  const result = db.prepare(`
    INSERT INTO searches (trip_id, category, snapshot_date, sites, trip_label)
    VALUES (?, ?, ?, ?, ?)
  `).run(tripId, category, snapshotDate, sites || null, tripLabel || null);
  return Number(result.lastInsertRowid);
}

function childTableFor(category) {
  if (category === 'flights') return 'flight_results';
  if (category === 'hotels') return 'hotel_results';
  return 'package_results';
}

// ── Result inserts ───────────────────────────────────────────────────────────

export function insertFlightResults(searchId, rows) {
  const db = openDb();
  const stmt = db.prepare(`
    INSERT INTO flight_results
      (search_id, site, airline, route, stops, outbound, return_times,
       per_person, base_price, bag_fees, total, amenities, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      searchId,
      r.site,
      r.airline || null,
      r.route || null,
      r.stops || null,
      r.outbound || null,
      r.return_ || r.return_times || null,
      r.perPerson || null,
      r.basePrice || null,
      r.bagFees || null,
      r.total || null,
      r.includes || r.amenities || null,
      r.error || null
    );
  }
}

export function insertHotelResults(searchId, rows) {
  const db = openDb();
  const stmt = db.prepare(`
    INSERT INTO hotel_results
      (search_id, site, property, type, rating, distance, hotel_address,
       per_night, total, fees, source, source_link, notes, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      searchId,
      r.site,
      r.property || null,
      r.type || null,
      r.rating || null,
      r.distance || null,
      r.hotelAddress || null,
      r.perNight || null,
      r.total || null,
      r.fees || null,
      r.source || null,
      r.sourceLink || null,
      r.notes || null,
      r.error || null
    );
  }
}

export function insertPackageResults(searchId, rows) {
  const db = openDb();
  const stmt = db.prepare(`
    INSERT INTO package_results
      (search_id, site, package_name, flight_cost, hotel_cost, per_person, total, error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of rows) {
    stmt.run(
      searchId,
      r.site,
      r.packageName || null,
      r.flightCost || null,
      r.hotelCost || null,
      r.perPerson || null,
      r.total || null,
      r.error || null
    );
  }
}

export const DB_FILE = DB_PATH;
