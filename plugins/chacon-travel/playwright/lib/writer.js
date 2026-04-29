import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRAVEL_PLANS_DIR = path.resolve(__dirname, '../../travel_plans');

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

/**
 * Builds the results.md content for a flights search.
 * Results are grouped under "#### <Site Name>" subheaders so it's easy to
 * scan per-site, and the redundant per-row Site column is dropped.
 */
function buildFlightsTable(results) {
  const sections = [];
  for (const [site, rows] of groupBySite(results)) {
    sections.push(`#### ${site}`);
    sections.push('');
    if (rows.length === 1 && rows[0].error) {
      sections.push(`_${rows[0].error}_`);
      sections.push('');
      continue;
    }
    sections.push('| Airline | Departure → Return | Stops | Includes | Per Person | Total (Group) |');
    sections.push('|---|---|---|---|---|---|');
    for (const r of rows) {
      if (r.error) {
        sections.push(`| _${r.error}_ | — | — | — | — | — |`);
      } else {
        sections.push(`| ${r.airline} | ${r.route} | ${r.stops} | ${r.includes || '—'} | ${r.perPerson} | ${r.total} |`);
      }
    }
    sections.push('');
  }
  return sections.join('\n').trimEnd();
}

/**
 * Builds the results.md content for a hotels search.
 */
function buildHotelsTable(results) {
  const sections = [];
  for (const [site, rows] of groupBySite(results)) {
    sections.push(`#### ${site}`);
    sections.push('');
    if (rows.length === 1 && rows[0].error) {
      sections.push(`_${rows[0].error}_`);
      sections.push('');
      continue;
    }
    sections.push('| Property | Type | Rating | Per Night | Total Stay | Notes |');
    sections.push('|---|---|---|---|---|---|');
    for (const r of rows) {
      if (r.error) {
        sections.push(`| _${r.error}_ | — | — | — | — | — |`);
      } else {
        sections.push(`| ${r.property} | ${r.type} | ${r.rating} | ${r.perNight} | ${r.total} | ${r.notes || ''} |`);
      }
    }
    sections.push('');
  }
  return sections.join('\n').trimEnd();
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

  return outPath;
}
