import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveSearch } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAVEL_PLANS_DIR = path.resolve(__dirname, '../../travel_plans');

/**
 * Builds the results.md content for a flights search.
 */
function buildFlightsTable(results) {
  const header = '| Site | Airline | Departure → Return | Stops | Per Person | Total (Group) |';
  const divider = '|---|---|---|---|---|---|';
  const rows = results.map(r => {
    if (r.error) {
      return `| ${r.site} | N/A | N/A | N/A | N/A | N/A |`;
    }
    return `| ${r.site} | ${r.airline} | ${r.route} | ${r.stops} | ${r.perPerson} | ${r.total} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/**
 * Builds the results.md content for a hotels search.
 */
function buildHotelsTable(results) {
  const header = '| Site | Property | Type | Rating | Per Night | Total Stay | Notes |';
  const divider = '|---|---|---|---|---|---|---|';
  const rows = results.map(r => {
    if (r.error) {
      return `| ${r.site} | N/A | — | — | — | — | ${r.error} |`;
    }
    return `| ${r.site} | ${r.property} | ${r.type} | ${r.rating} | ${r.perNight} | ${r.total} | ${r.notes || ''} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/**
 * Builds the results.md content for a vacation-packages search.
 */
function buildPackagesTable(results) {
  const header = '| Site | Package / Hotel | Flight Cost | Hotel Cost | Per Person | Total (Group) |';
  const divider = '|---|---|---|---|---|---|';
  const rows = results.map(r => {
    if (r.error) {
      return `| ${r.site} | N/A | N/A | N/A | N/A | N/A |`;
    }
    return `| ${r.site} | ${r.packageName} | ${r.flightCost} | ${r.hotelCost} | ${r.perPerson} | ${r.total} |`;
  });
  return [header, divider, ...rows].join('\n');
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
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  let tableContent;
  if (params.category === 'flights') {
    tableContent = buildFlightsTable(results);
  } else if (params.category === 'hotels') {
    tableContent = buildHotelsTable(results);
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
    params.category,
    `processed=${date}`
  );
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, 'results.md');

  // Append if file exists (multiple runs on the same day), otherwise create
  if (fs.existsSync(outPath)) {
    fs.appendFileSync(outPath, '\n---\n\n' + content, 'utf8');
  } else {
    fs.writeFileSync(outPath, content, 'utf8');
  }

  // Persist to SQLite alongside markdown (non-fatal — markdown is source of truth)
  try {
    saveSearch({ params, results });
  } catch (err) {
    console.warn(`  [db] Write skipped: ${err.message}`);
  }

  return outPath;
}
