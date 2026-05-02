-- chacon-travel SQLite schema. Idempotent: safe to run on every startup.
-- All cost/price fields are TEXT to preserve "$1,234" formatting from scrapers
-- without re-parsing on the way out.

-- ── Trips ────────────────────────────────────────────────────────────────────
-- A saved or implicitly-created trip definition. /trip-save inserts named
-- trips; ad-hoc /flights or /hotels runs upsert against the unique key so
-- repeated searches don't duplicate trip rows.
CREATE TABLE IF NOT EXISTS trips (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT,                                          -- user-given label, e.g. "Databricks AI Summit 2026"
  slug          TEXT NOT NULL,                                 -- e.g. "san-francisco-ca"
  destination   TEXT NOT NULL,
  origin        TEXT,                                          -- NULL for hotels-only trips
  depart        TEXT NOT NULL,                                 -- YYYY-MM-DD
  return        TEXT NOT NULL,                                 -- YYYY-MM-DD
  travelers     INTEGER NOT NULL DEFAULT 1,
  rooms         INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (slug, depart, return, travelers, COALESCE(origin, ''))
);
CREATE INDEX IF NOT EXISTS idx_trips_name ON trips(name);

-- ── Searches ─────────────────────────────────────────────────────────────────
-- One row per search execution. snapshot_date is YYYY-MM-DD; the unique
-- constraint enforces "same trip + category + day = single row". Re-running
-- the same search same-day deletes child results and re-inserts (dedupe);
-- cross-day appends a new snapshot for price-drift queries.
CREATE TABLE IF NOT EXISTS searches (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id         INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN ('flights','hotels','vacation-packages')),
  snapshot_date   TEXT NOT NULL,                               -- YYYY-MM-DD (for dedupe)
  searched_at     TEXT NOT NULL DEFAULT (datetime('now')),     -- full ISO timestamp
  sites           TEXT,                                        -- comma-separated sites included
  trip_label      TEXT,                                        -- denormalized --trip flag value
  UNIQUE (trip_id, category, snapshot_date)
);

-- ── Flight results ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flight_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id       INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  site            TEXT NOT NULL,
  airline         TEXT,
  route           TEXT,
  stops           TEXT,
  outbound        TEXT,
  return_times    TEXT,
  per_person      TEXT,
  base_price      TEXT,
  bag_fees        TEXT,
  total           TEXT,
  amenities       TEXT,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_flights_search ON flight_results(search_id);

-- ── Hotel results ────────────────────────────────────────────────────────────
-- Schema matches the v1.3 expanded results: distance, fees, source link, etc.
CREATE TABLE IF NOT EXISTS hotel_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id       INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  site            TEXT NOT NULL,
  property        TEXT,
  type            TEXT,
  rating          TEXT,
  distance        TEXT,                                        -- e.g. "0.5 mi"
  hotel_address   TEXT,
  per_night       TEXT,
  total           TEXT,
  fees            TEXT,
  source          TEXT,                                        -- provider, e.g. "Booking.com"
  source_link     TEXT,                                        -- URL to booking
  notes           TEXT,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_hotels_search ON hotel_results(search_id);

-- ── Package results ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS package_results (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  search_id       INTEGER NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  site            TEXT NOT NULL,
  package_name    TEXT,
  flight_cost     TEXT,
  hotel_cost      TEXT,
  per_person      TEXT,
  total           TEXT,
  error           TEXT
);
CREATE INDEX IF NOT EXISTS idx_packages_search ON package_results(search_id);
