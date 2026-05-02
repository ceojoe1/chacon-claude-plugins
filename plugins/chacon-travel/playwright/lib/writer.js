import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bagFeesForTrip } from './bag-fees.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve travel_plans/ relative to the working directory the user invoked
// the script from. This lets users control where output lands by cd-ing to
// the desired folder before running, which works equally well for the
// source repo workflow and for /chacon-travel:travel-setup installations.
//
// Override with TRAVEL_PLANS_DIR env var if you need a fixed absolute path
// (e.g. running from a scheduled job whose cwd you don't control).
const TRAVEL_PLANS_DIR = process.env.TRAVEL_PLANS_DIR
  ? path.resolve(process.env.TRAVEL_PLANS_DIR)
  : path.resolve(process.cwd(), 'travel_plans');

/**
 * Returns the current time formatted in the local timezone, e.g.
 * "2026-04-29 2:30:45 PM MDT".
 */
function localTimestamp() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const datePart = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  // toLocaleTimeString gives "2:30:45 PM MDT" with hour12 + timeZoneName
  const timeWithTz = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short',
  });
  return `${datePart} ${timeWithTz}`;
}

/**
 * Groups results by site, preserving first-appearance order.
 */
function groupBySite(results) {
  const bySite = new Map();
  for (const r of results) {
    if (!bySite.has(r.site)) bySite.set(r.site, []);
    bySite.get(r.site).push(r);
  }
  return bySite;
}

// Flat-table column order for flights — used by both Markdown and CSV outputs.
const FLIGHT_COLUMNS = [
  'Processed Timestamp',
  'Origin',
  'Destination',
  'Travelers',
  'Site',
  'Airline',
  'Departure Date',
  'Return Date',
  'Departure Times',
  'Return Times',
  'Stops (out/ret)',
  'Round Trip Cost',
  'Extra Costs (out/ret)',
  'Total Cost',
  'Amenities',
];

function flightRow(params, r, timestamp) {
  const baseRt = r.baseRtPrice || null;
  const fees = bagFeesForTrip(r.airline, params.travelers);
  const baseGroup = baseRt != null ? baseRt * params.travelers : null;
  const totalGroup = baseGroup != null ? baseGroup + fees.total : null;
  return {
    'Processed Timestamp': timestamp,
    Origin: params.origin,
    Destination: params.destination,
    Travelers: params.travelers,
    Site: r.site,
    Airline: r.airline || '—',
    'Departure Date': params.depart,
    'Return Date': params.return,
    'Departure Times': r.outbound || '—',
    'Return Times': r.return_ || '—',
    'Stops (out/ret)': r.stops || `${r.stopsOut || '—'} / ${r.stopsRet || '—'}`,
    'Round Trip Cost': baseGroup != null ? `$${baseGroup.toLocaleString('en-US')}` : (r.perPerson || '—'),
    'Extra Costs (out/ret)': r.bagFees || `$${fees.outbound} / $${fees.return}`,
    'Total Cost': totalGroup != null ? `$${totalGroup.toLocaleString('en-US')}` : (r.total || '—'),
    Amenities: r.includes || '—',
  };
}

function buildFlightsTable(params, results, timestamp) {
  const lines = [];
  lines.push('| ' + FLIGHT_COLUMNS.join(' | ') + ' |');
  lines.push('|' + FLIGHT_COLUMNS.map(() => '---').join('|') + '|');

  // Errors: emit a single row per failed site with the error in the Airline column
  for (const r of results) {
    if (r.error) {
      // Collapse multi-line / pipe-bearing errors so the markdown row stays valid
      const flatErr = String(r.error).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
      const errCells = FLIGHT_COLUMNS.map(c => {
        if (c === 'Processed Timestamp') return timestamp;
        if (c === 'Site') return r.site || '—';
        if (c === 'Airline') return `_${flatErr}_`;
        if (c === 'Origin') return params.origin;
        if (c === 'Destination') return params.destination;
        if (c === 'Travelers') return String(params.travelers);
        if (c === 'Departure Date') return params.depart;
        if (c === 'Return Date') return params.return;
        return '—';
      });
      lines.push('| ' + errCells.join(' | ') + ' |');
      continue;
    }
    const row = flightRow(params, { ...r, site: r.site }, timestamp);
    lines.push('| ' + FLIGHT_COLUMNS.map(c => row[c] ?? '—').join(' | ') + ' |');
  }
  return lines.join('\n');
}

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function buildFlightsCsv(params, results, timestamp) {
  const lines = [FLIGHT_COLUMNS.map(csvEscape).join(',')];
  for (const r of results) {
    if (r.error) continue;
    const row = flightRow(params, { ...r, site: r.site }, timestamp);
    lines.push(FLIGHT_COLUMNS.map(c => csvEscape(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

/**
 * Flatten per-site result groups into per-row entries with site attached.
 * Some scrapers return { site, results: [...] } while error sites return
 * { site, error }. Normalize both.
 */
function flattenResults(results) {
  const out = [];
  for (const grp of results) {
    if (grp.error) {
      out.push({ site: grp.site, error: grp.error });
    } else if (Array.isArray(grp.results)) {
      for (const row of grp.results) out.push({ ...row, site: grp.site });
    } else {
      out.push(grp);
    }
  }
  return out;
}

// Flat-table column order for hotels — used by both Markdown and CSV outputs.
const HOTEL_COLUMNS = [
  'Processed Timestamp',
  'Trip',
  'Search',
  'Site',
  'Hotel',
  'Distance',
  'Rating',
  'Check-in',
  'Check-in Time',
  'Check-out',
  'Check-out Time',
  'Per Night',
  'Total',
  'Fees',
  'Source',
  'Source Link',
  'Notes',
];

function hotelRow(params, r, timestamp) {
  return {
    'Processed Timestamp': timestamp,
    Trip: params.trip || '—',
    Search: params.destination,
    Site: r.site,
    Hotel: r.property || '—',
    Distance: r.distance || '—',
    Rating: r.rating || '—',
    'Check-in': params.depart,
    'Check-in Time': '3:00 PM',
    'Check-out': params.return,
    'Check-out Time': '11:00 AM',
    'Per Night': r.perNight || '—',
    Total: r.total || '—',
    Fees: r.fees || '—',
    Source: r.source || '—',
    'Source Link': r.sourceLink || '—',
    Notes: r.notes || '',
  };
}

function buildHotelsTable(params, results, timestamp) {
  const lines = [];
  lines.push('| ' + HOTEL_COLUMNS.join(' | ') + ' |');
  lines.push('|' + HOTEL_COLUMNS.map(() => '---').join('|') + '|');
  for (const r of results) {
    if (r.error) {
      const flatErr = String(r.error).replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
      const errCells = HOTEL_COLUMNS.map(c => {
        if (c === 'Processed Timestamp') return timestamp;
        if (c === 'Trip') return params.trip || '—';
        if (c === 'Search') return params.destination;
        if (c === 'Site') return r.site || '—';
        if (c === 'Hotel') return `_${flatErr}_`;
        if (c === 'Check-in') return params.depart;
        if (c === 'Check-out') return params.return;
        return '—';
      });
      lines.push('| ' + errCells.join(' | ') + ' |');
      continue;
    }
    const row = hotelRow(params, r, timestamp);
    lines.push('| ' + HOTEL_COLUMNS.map(c => row[c] ?? '—').join(' | ') + ' |');
  }
  return lines.join('\n');
}

function buildHotelsCsv(params, results, timestamp) {
  const lines = [HOTEL_COLUMNS.map(csvEscape).join(',')];
  for (const r of results) {
    if (r.error) continue;
    const row = hotelRow(params, r, timestamp);
    lines.push(HOTEL_COLUMNS.map(c => csvEscape(row[c])).join(','));
  }
  return lines.join('\n') + '\n';
}

/**
 * Builds the results.md content for a vacation-packages search.
 */
function buildPackagesTable(results) {
  const sections = [];
  for (const [site, rows] of groupBySite(results)) {
    sections.push(`#### ${site}`);
    sections.push('');
    if (rows.length === 1 && rows[0].error) {
      sections.push(`_${rows[0].error}_`);
      sections.push('');
      continue;
    }
    sections.push('| Package / Hotel | Flight Cost | Hotel Cost | Per Person | Total (Group) |');
    sections.push('|---|---|---|---|---|');
    for (const r of rows) {
      if (r.error) {
        sections.push(`| _${r.error}_ | — | — | — | — |`);
      } else {
        sections.push(`| ${r.packageName} | ${r.flightCost} | ${r.hotelCost} | ${r.perPerson} | ${r.total} |`);
      }
    }
    sections.push('');
  }
  return sections.join('\n').trimEnd();
}

function buildInputsTable(params) {
  const rows = [];
  if (params.category === 'flights') {
    rows.push(`| Origin | ${params.origin} |`);
    rows.push(`| Destination | ${params.destination} |`);
    rows.push(`| Departure | ${params.depart} |`);
    rows.push(`| Return | ${params.return} |`);
    rows.push(`| Travelers | ${params.travelers} |`);
  } else if (params.category === 'hotels') {
    rows.push(`| Destination | ${params.destination} |`);
    rows.push(`| Check-in | ${params.depart} |`);
    rows.push(`| Check-out | ${params.return} |`);
    rows.push(`| Guests | ${params.travelers} |`);
    rows.push(`| Rooms | ${params.rooms} |`);
  } else {
    rows.push(`| Destination | ${params.destination} |`);
    rows.push(`| Origin | ${params.origin} |`);
    rows.push(`| Check-in | ${params.depart} |`);
    rows.push(`| Check-out | ${params.return} |`);
    rows.push(`| Travelers | ${params.travelers} |`);
  }
  return ['| Field | Value |', '|---|---|', ...rows].join('\n');
}

function categoryLabel(category) {
  if (category === 'flights') return 'Flights';
  if (category === 'hotels') return 'Hotels';
  return 'Vacation Packages';
}

/**
 * Writes results to travel_plans/[slug]/[category]/processed=[date]/results.md
 * Returns the path written.
 */
export function writeResults({ params, results, date }) {
  const label = categoryLabel(params.category);
  const timestamp = localTimestamp();

  let tableContent;
  let csvContent = null;
  if (params.category === 'flights') {
    tableContent = buildFlightsTable(params, results, timestamp);
    csvContent = buildFlightsCsv(params, results, timestamp);
  } else if (params.category === 'hotels') {
    tableContent = buildHotelsTable(params, results, timestamp);
    csvContent = buildHotelsCsv(params, results, timestamp);
  } else {
    tableContent = buildPackagesTable(results);
  }

  const content = `## ${label} — Searched: ${timestamp}

### Inputs
${buildInputsTable(params)}

### Results
${tableContent}
`;

  const outDir = path.join(
    TRAVEL_PLANS_DIR,
    params.slug,
    params.category
  );
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'results.md');

  // Append if file exists (multiple runs on the same day), otherwise create
  if (fs.existsSync(outPath)) {
    fs.appendFileSync(outPath, '\n---\n\n' + content, 'utf8');
  } else {
    fs.writeFileSync(outPath, content, 'utf8');
  }

  // Also emit CSV alongside the .md for spreadsheet viewing. Append rows
  // (without re-emitting the header) when the CSV already exists for the day.
  if (csvContent) {
    const csvPath = path.join(outDir, 'results.csv');
    if (fs.existsSync(csvPath)) {
      const lines = csvContent.split('\n');
      const dataOnly = lines.slice(1).join('\n'); // drop header on append
      if (dataOnly.trim()) {
        fs.appendFileSync(csvPath, dataOnly, 'utf8');
      }
    } else {
      fs.writeFileSync(csvPath, csvContent, 'utf8');
    }
  }

  return outPath;
}
