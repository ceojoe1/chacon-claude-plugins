'use strict';

const path = require('node:path');
const fs = require('node:fs');
const readline = require('node:readline');

// Default: <plugin-root>/data/vacai.db. Honors CHACON_TRAVEL_DATA_DIR /
// TRAVEL_PLANS_DIR env var so this matches the writer's resolution exactly.
const DATA_DIR_ENV = process.env.CHACON_TRAVEL_DATA_DIR || process.env.TRAVEL_PLANS_DIR;
const DB_PATH = DATA_DIR_ENV
  ? path.resolve(DATA_DIR_ENV, 'vacai.db')
  : path.resolve(__dirname, '../data/vacai.db');

let _db = null;

function getDb() {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) return null;
  try {
    const { DatabaseSync } = require('node:sqlite');
    _db = new DatabaseSync(DB_PATH, { readOnly: true });
    return _db;
  } catch (err) {
    return null;
  }
}

// ── Query functions ──────────────────────────────────────────────────────────

function queryTrips() {
  const db = getDb();
  if (!db) return 'No data yet — run a search first with /flights, /hotels, or /vacation-packages.';
  const rows = db.prepare('SELECT * FROM trips ORDER BY destination, depart').all();
  if (!rows.length) return 'No trips found in the database yet.';
  return rows.map(r =>
    `[${r.id}] ${r.destination} | origin: ${r.origin || '(hotels)'} | ${r.depart}–${r.return} | ${r.travelers} travelers${r.rooms ? `, ${r.rooms} rooms` : ''} | slug: ${r.slug}`
  ).join('\n');
}

function queryPriceHistory(slug, category) {
  const db = getDb();
  if (!db) return 'No data yet — run a search first.';

  if (category === 'flights') {
    const rows = db.prepare(`
      SELECT s.searched_at, f.site, f.airline, f.route, f.stops, f.per_person, f.total, f.error
      FROM searches s
      JOIN trips t ON t.id = s.trip_id
      JOIN flight_results f ON f.search_id = s.id
      WHERE t.slug = ? AND s.category = 'flights'
      ORDER BY s.searched_at
    `).all(slug);
    if (!rows.length) return `No flight history found for "${slug}".`;
    return `Flight price history for ${slug}:\n` + rows.map(r =>
      `${r.searched_at.slice(0, 10)} | ${r.site} | ${r.airline || '—'} | ${r.route || '—'} | ${r.stops || '—'} | ${r.per_person || '—'} | ${r.total || '—'}${r.error ? ` | ⚠ ${r.error}` : ''}`
    ).join('\n');
  }

  if (category === 'hotels') {
    const rows = db.prepare(`
      SELECT s.searched_at, h.site, h.property, h.type, h.rating, h.distance,
             h.per_night, h.total, h.fees, h.source, h.source_link, h.notes, h.error
      FROM searches s
      JOIN trips t ON t.id = s.trip_id
      JOIN hotel_results h ON h.search_id = s.id
      WHERE t.slug = ? AND s.category = 'hotels'
      ORDER BY s.searched_at
    `).all(slug);
    if (!rows.length) return `No hotel history found for "${slug}".`;
    return `Hotel price history for ${slug}:\n` + rows.map(r =>
      `${r.searched_at.slice(0, 10)} | ${r.site} | ${r.property || '—'} | ${r.distance || '—'} | ${r.rating || '—'} | ${r.per_night || '—'}/night | ${r.total || '—'} (fees ${r.fees || '—'}) via ${r.source || '—'}${r.error ? ` | ⚠ ${r.error}` : ''}`
    ).join('\n');
  }

  // vacation-packages
  const rows = db.prepare(`
    SELECT s.searched_at, p.site, p.package_name, p.flight_cost, p.hotel_cost, p.per_person, p.total, p.error
    FROM searches s
    JOIN trips t ON t.id = s.trip_id
    JOIN package_results p ON p.search_id = s.id
    WHERE t.slug = ? AND s.category = 'vacation-packages'
    ORDER BY s.searched_at
  `).all(slug);
  if (!rows.length) return `No vacation package history found for "${slug}".`;
  return `Vacation package history for ${slug}:\n` + rows.map(r =>
    `${r.searched_at.slice(0, 10)} | ${r.site} | ${r.package_name || '—'} | flights: ${r.flight_cost || '—'} | hotel: ${r.hotel_cost || '—'} | ${r.per_person || '—'}/person | ${r.total || '—'}${r.error ? ` | ⚠ ${r.error}` : ''}`
  ).join('\n');
}

function queryBestFares(slug) {
  const db = getDb();
  if (!db) return 'No data yet — run a search first.';

  const trip = db.prepare('SELECT destination, depart, return, travelers FROM trips WHERE slug = ? LIMIT 1').get(slug);
  if (!trip) return `No trip found for slug "${slug}". Use get_trips to see available slugs.`;

  const lines = [`Best fares for ${trip.destination} (${trip.depart}–${trip.return}, ${trip.travelers} travelers):\n`];

  const flight = db.prepare(`
    SELECT f.site, f.airline, f.per_person, f.total, s.searched_at
    FROM flight_results f
    JOIN searches s ON s.id = f.search_id
    JOIN trips t ON t.id = s.trip_id
    WHERE t.slug = ? AND (f.error IS NULL OR f.error = '')
      AND f.total IS NOT NULL AND f.total NOT IN ('', 'N/A')
    ORDER BY s.searched_at DESC, f.id
    LIMIT 1
  `).get(slug);
  lines.push(`  Flights:  ${flight ? `${flight.airline} via ${flight.site} — ${flight.per_person}/person, ${flight.total} total (searched ${flight.searched_at.slice(0, 10)})` : 'No data'}`);

  const hotel = db.prepare(`
    SELECT h.site, h.property, h.per_night, h.total, s.searched_at
    FROM hotel_results h
    JOIN searches s ON s.id = h.search_id
    JOIN trips t ON t.id = s.trip_id
    WHERE t.slug = ? AND (h.error IS NULL OR h.error = '')
      AND h.total IS NOT NULL AND h.total NOT IN ('', 'N/A')
    ORDER BY s.searched_at DESC, h.id
    LIMIT 1
  `).get(slug);
  lines.push(`  Hotels:   ${hotel ? `${hotel.property} via ${hotel.site} — ${hotel.per_night}/night, ${hotel.total} total (searched ${hotel.searched_at.slice(0, 10)})` : 'No data'}`);

  const pkg = db.prepare(`
    SELECT p.site, p.package_name, p.per_person, p.total, s.searched_at
    FROM package_results p
    JOIN searches s ON s.id = p.search_id
    JOIN trips t ON t.id = s.trip_id
    WHERE t.slug = ? AND (p.error IS NULL OR p.error = '')
      AND p.total IS NOT NULL AND p.total NOT IN ('', 'N/A')
    ORDER BY s.searched_at DESC, p.id
    LIMIT 1
  `).get(slug);
  lines.push(`  Packages: ${pkg ? `${pkg.package_name} via ${pkg.site} — ${pkg.per_person}/person, ${pkg.total} total (searched ${pkg.searched_at.slice(0, 10)})` : 'No data'}`);

  return lines.join('\n');
}

function queryCompareDestinations(category) {
  const db = getDb();
  if (!db) return 'No data yet — run a search first.';

  const trips = db.prepare('SELECT DISTINCT slug, destination, depart, return, travelers FROM trips ORDER BY destination').all();
  if (!trips.length) return 'No destinations in the database yet.';

  const lines = [`Best ${category} fares by destination (most recent search per destination):\n`];
  let found = 0;

  for (const t of trips) {
    let row;
    if (category === 'flights') {
      row = db.prepare(`
        SELECT f.site, f.airline, f.per_person, f.total, s.searched_at
        FROM flight_results f
        JOIN searches s ON s.id = f.search_id
        WHERE s.trip_id = (SELECT id FROM trips WHERE slug = ? LIMIT 1)
          AND s.category = 'flights'
          AND (f.error IS NULL OR f.error = '')
          AND f.total IS NOT NULL AND f.total NOT IN ('', 'N/A')
        ORDER BY s.searched_at DESC, f.id
        LIMIT 1
      `).get(t.slug);
      if (row) {
        lines.push(`  ${t.destination} (${t.depart}–${t.return}): ${row.airline} via ${row.site} — ${row.per_person}/person, ${row.total} total`);
        found++;
      }
    } else if (category === 'hotels') {
      row = db.prepare(`
        SELECT h.site, h.property, h.per_night, h.total, s.searched_at
        FROM hotel_results h
        JOIN searches s ON s.id = h.search_id
        WHERE s.trip_id = (SELECT id FROM trips WHERE slug = ? LIMIT 1)
          AND s.category = 'hotels'
          AND (h.error IS NULL OR h.error = '')
          AND h.total IS NOT NULL AND h.total NOT IN ('', 'N/A')
        ORDER BY s.searched_at DESC, h.id
        LIMIT 1
      `).get(t.slug);
      if (row) {
        lines.push(`  ${t.destination} (${t.depart}–${t.return}): ${row.property} via ${row.site} — ${row.per_night}/night, ${row.total} total`);
        found++;
      }
    } else {
      row = db.prepare(`
        SELECT p.site, p.package_name, p.per_person, p.total, s.searched_at
        FROM package_results p
        JOIN searches s ON s.id = p.search_id
        WHERE s.trip_id = (SELECT id FROM trips WHERE slug = ? LIMIT 1)
          AND s.category = 'vacation-packages'
          AND (p.error IS NULL OR p.error = '')
          AND p.total IS NOT NULL AND p.total NOT IN ('', 'N/A')
        ORDER BY s.searched_at DESC, p.id
        LIMIT 1
      `).get(t.slug);
      if (row) {
        lines.push(`  ${t.destination} (${t.depart}–${t.return}): ${row.package_name} via ${row.site} — ${row.per_person}/person, ${row.total} total`);
        found++;
      }
    }
  }

  if (!found) return `No ${category} results found across destinations (all may be N/A or error rows).`;
  return lines.join('\n');
}

function querySiteReliability() {
  const db = getDb();
  if (!db) return 'No data yet — run a search first.';

  const format = (rows, label) => {
    if (!rows.length) return `${label}:\n  (no data)`;
    const lines = rows.map(r => {
      const success = r.total - r.errors;
      const pct = r.total > 0 ? Math.round((success / r.total) * 100) : 0;
      return `  ${r.site}: ${success}/${r.total} succeeded (${pct}%)`;
    });
    return `${label}:\n${lines.join('\n')}`;
  };

  const flights = db.prepare(`
    SELECT site, COUNT(*) as total,
           SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) as errors
    FROM flight_results WHERE site IS NOT NULL
    GROUP BY site ORDER BY site
  `).all();

  const hotels = db.prepare(`
    SELECT site, COUNT(*) as total,
           SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) as errors
    FROM hotel_results WHERE site IS NOT NULL
    GROUP BY site ORDER BY site
  `).all();

  const packages = db.prepare(`
    SELECT site, COUNT(*) as total,
           SUM(CASE WHEN error IS NOT NULL AND error != '' THEN 1 ELSE 0 END) as errors
    FROM package_results WHERE site IS NOT NULL
    GROUP BY site ORDER BY site
  `).all();

  return [
    'Site reliability across all searches:\n',
    format(flights, 'Flights'),
    '',
    format(hotels, 'Hotels'),
    '',
    format(packages, 'Vacation Packages'),
  ].join('\n');
}

// ── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'get_trips',
    description: 'List all trips stored in the travel database (destinations, dates, traveler counts).',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_price_history',
    description: 'Get all search results for a destination and category over time, showing how prices have changed across runs.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Destination slug (e.g. "orlando-fl", "las-vegas-nv"). Use get_trips to find slugs.',
        },
        category: {
          type: 'string',
          enum: ['flights', 'hotels', 'vacation-packages'],
          description: 'Which category of search results to retrieve.',
        },
      },
      required: ['slug', 'category'],
    },
  },
  {
    name: 'get_best_fares',
    description: 'Get the best (most recent non-N/A) fare per category for a specific destination.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Destination slug (e.g. "orlando-fl"). Use get_trips to find slugs.',
        },
      },
      required: ['slug'],
    },
  },
  {
    name: 'compare_destinations',
    description: 'Compare the best fare across all searched destinations for a given category.',
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['flights', 'hotels', 'vacation-packages'],
          description: 'Category to compare across destinations.',
        },
      },
      required: ['category'],
    },
  },
  {
    name: 'get_site_reliability',
    description: 'Show success/error rates per travel site across all searches — useful for knowing which sites tend to block or return N/A.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
];

// ── MCP stdio server ─────────────────────────────────────────────────────────

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function main() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    line = line.trim();
    if (!line) return;

    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return; // ignore malformed input
    }

    const { id, method, params } = req;

    // Notifications (no id) — no response required
    if (id === undefined || id === null) return;

    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'chacon-travel-db', version: '2.0.0' },
        },
      });

    } else if (method === 'tools/list') {
      send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });

    } else if (method === 'tools/call') {
      const toolName = params && params.name;
      const toolArgs = (params && params.arguments) || {};
      let text;
      try {
        text = handleToolCall(toolName, toolArgs);
      } catch (err) {
        text = `Error running tool: ${err.message}`;
      }
      send({
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text: String(text) }] },
      });

    } else {
      send({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
    }
  });
}

function handleToolCall(name, args) {
  switch (name) {
    case 'get_trips':             return queryTrips();
    case 'get_price_history':     return queryPriceHistory(args.slug, args.category);
    case 'get_best_fares':        return queryBestFares(args.slug);
    case 'compare_destinations':  return queryCompareDestinations(args.category);
    case 'get_site_reliability':  return querySiteReliability();
    default:                      return `Unknown tool: ${name}`;
  }
}

main();
