// CSV importer: scans a directory for legacy results.csv files and replays
// them into the SQLite DB. Group by (trip key, snapshot date) for dedupe.
//
// Usage:  node import.js <root-dir>

import path from 'path';
import fs from 'fs';
import { upsertTrip, upsertSearchSnapshot, insertFlightResults, insertHotelResults, insertPackageResults, closeDb } from './lib/db.js';
import { toSlug } from './lib/args.js';

if (process.argv.length < 3) {
  console.error('Usage: node import.js <root-dir>');
  process.exit(1);
}
const root = path.resolve(process.argv[2]);
if (!fs.existsSync(root)) {
  console.error(`No such directory: ${root}`);
  process.exit(1);
}

// ── Walk for results.csv ─────────────────────────────────────────────────────
function findCsvs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) findCsvs(full, out);
    else if (entry.isFile() && entry.name === 'results.csv') out.push(full);
  }
  return out;
}

// ── CSV parsing (handles quoted fields with commas) ──────────────────────────
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else cell += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (cell.length || row.length) { row.push(cell); rows.push(row); row = []; cell = ''; }
        if (c === '\r' && text[i + 1] === '\n') i++;
      } else cell += c;
    }
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) return { header: [], rows: [] };
  return { header: rows[0], rows: rows.slice(1) };
}

function detectCategory(header, filePath) {
  const set = new Set(header);
  if (set.has('Per Night') || set.has('Hotel')) return 'hotels';
  if (set.has('Airline') || set.has('Departure Times')) return 'flights';
  if (set.has('Package / Hotel') || set.has('Flight Cost')) return 'vacation-packages';
  // Fall back to path segment (e.g. .../<slug>/hotels/results.csv)
  const segs = filePath.split(/[\\/]/);
  if (segs.includes('flights')) return 'flights';
  if (segs.includes('hotels')) return 'hotels';
  if (segs.includes('vacation-packages') || segs.includes('vacation_packages')) return 'vacation-packages';
  return null;
}

// Rows → object map keyed by header column names.
function asRecords(header, rows) {
  return rows.filter(r => r.length === header.length || r.length === header.length + 1).map(r => {
    const o = {};
    header.forEach((h, i) => { o[h] = r[i] ?? ''; });
    return o;
  });
}

function snapshotDateOf(record) {
  // "2026-05-01 4:08:36 PM MDT" → "2026-05-01"
  const ts = record['Processed Timestamp'] || '';
  const m = ts.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

// ── Per-category group + insert ──────────────────────────────────────────────
function importHotels(records) {
  // Group by (Search, Check-in, Check-out, Trip) → trip; then by snapshot_date.
  const tripGroups = new Map();
  for (const r of records) {
    const key = [r.Search, r['Check-in'], r['Check-out']].join('|');
    if (!tripGroups.has(key)) tripGroups.set(key, []);
    tripGroups.get(key).push(r);
  }
  let imported = 0;
  for (const [, rows] of tripGroups) {
    const sample = rows[0];
    const tripParams = {
      trip: sample.Trip && sample.Trip !== '—' ? sample.Trip : null,
      slug: toSlug(sample.Search),
      destination: sample.Search,
      origin: null,
      depart: sample['Check-in'],
      return: sample['Check-out'],
      travelers: 1,
      rooms: 1,
    };
    const tripId = upsertTrip(tripParams);

    // Group by snapshot_date — insert each as its own search snapshot.
    const byDate = new Map();
    for (const r of rows) {
      const d = snapshotDateOf(r) || new Date().toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(r);
    }
    for (const [date, dateRows] of byDate) {
      const searchId = upsertSearchSnapshot({
        tripId, category: 'hotels', sites: null, tripLabel: tripParams.trip,
        snapshotDate: date,
      });
      insertHotelResults(searchId, dateRows.map(r => ({
        site: r.Site || 'unknown',
        property: r.Hotel,
        type: r.Type || 'Hotel',
        rating: r.Rating,
        distance: r.Distance,
        perNight: r['Per Night'],
        total: r.Total,
        fees: r.Fees,
        source: r.Source,
        sourceLink: r['Source Link'] === '—' ? null : r['Source Link'],
        notes: r.Notes,
      })));
      imported += dateRows.length;
    }
  }
  return imported;
}

function importFlights(records) {
  const tripGroups = new Map();
  for (const r of records) {
    const key = [r.Origin, r.Destination, r['Departure Date'], r['Return Date'], r.Travelers].join('|');
    if (!tripGroups.has(key)) tripGroups.set(key, []);
    tripGroups.get(key).push(r);
  }
  let imported = 0;
  for (const [, rows] of tripGroups) {
    const sample = rows[0];
    const tripParams = {
      trip: null,
      slug: toSlug(sample.Destination),
      destination: sample.Destination,
      origin: sample.Origin,
      depart: sample['Departure Date'],
      return: sample['Return Date'],
      travelers: Number(sample.Travelers) || 1,
      rooms: 1,
    };
    const tripId = upsertTrip(tripParams);

    const byDate = new Map();
    for (const r of rows) {
      const d = snapshotDateOf(r) || new Date().toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(r);
    }
    for (const [date, dateRows] of byDate) {
      const searchId = upsertSearchSnapshot({ tripId, category: 'flights', sites: null, tripLabel: null, snapshotDate: date });
      insertFlightResults(searchId, dateRows.map(r => ({
        site: r.Site || 'unknown',
        airline: r.Airline,
        route: r.Route,
        stops: r['Stops (out/ret)'] || r.Stops,
        outbound: r['Departure Times'],
        return_: r['Return Times'],
        perPerson: r['Round Trip Cost'] || r['Per Person'],
        total: r['Total Cost'] || r.Total,
        bagFees: r['Extra Costs (out/ret)'] || r['Bag Fees'],
        includes: r.Amenities,
      })));
      imported += dateRows.length;
    }
  }
  return imported;
}

function importPackages(records) {
  const tripGroups = new Map();
  for (const r of records) {
    const key = [r.Origin, r.Destination, r['Departure Date'], r['Return Date'], r.Travelers].join('|');
    if (!tripGroups.has(key)) tripGroups.set(key, []);
    tripGroups.get(key).push(r);
  }
  let imported = 0;
  for (const [, rows] of tripGroups) {
    const sample = rows[0];
    const tripParams = {
      trip: null,
      slug: toSlug(sample.Destination || sample.Search || ''),
      destination: sample.Destination || sample.Search || '',
      origin: sample.Origin,
      depart: sample['Departure Date'] || sample['Check-in'],
      return: sample['Return Date'] || sample['Check-out'],
      travelers: Number(sample.Travelers) || 1,
      rooms: 1,
    };
    const tripId = upsertTrip(tripParams);
    const searchId = upsertSearchSnapshot({ tripId, category: 'vacation-packages', sites: null, tripLabel: null });
    insertPackageResults(searchId, rows.map(r => ({
      site: r.Site || 'unknown',
      packageName: r['Package / Hotel'] || r['Package Name'],
      flightCost: r['Flight Cost'],
      hotelCost: r['Hotel Cost'],
      perPerson: r['Per Person'],
      total: r['Total (Group)'] || r.Total,
    })));
    imported += rows.length;
  }
  return imported;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const csvs = findCsvs(root);
console.log(`Found ${csvs.length} results.csv file(s) under ${root}`);

let totalImported = 0;
for (const file of csvs) {
  const text = fs.readFileSync(file, 'utf8');
  const { header, rows } = parseCsv(text);
  const category = detectCategory(header, file);
  if (!category) {
    console.log(`  [skip] ${file} — could not detect category`);
    continue;
  }
  const records = asRecords(header, rows);
  if (!records.length) {
    console.log(`  [empty] ${file}`);
    continue;
  }
  let n = 0;
  if (category === 'hotels') n = importHotels(records);
  else if (category === 'flights') n = importFlights(records);
  else if (category === 'vacation-packages') n = importPackages(records);
  console.log(`  [${category}] ${file} → ${n} row(s)`);
  totalImported += n;
}

closeDb();
console.log(`\nDone. Imported ${totalImported} row(s) total.`);
process.exit(0);
