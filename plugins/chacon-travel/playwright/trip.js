// CLI for saved trips: save | list | rerun.
// Backs the /trip-save, /trip-list, /trip-rerun skills.

import minimist from 'minimist';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { upsertTrip, closeDb } from './lib/db.js';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './lib/data-dir.js';
import { toSlug } from './lib/args.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(DATA_DIR, 'vacai.db');

const USAGE = `
Usage:
  node trip.js save --name "<label>" --destination "<dest>" --depart YYYY-MM-DD --return YYYY-MM-DD [--origin <ORIG>] [--travelers N] [--rooms N]
  node trip.js list
  node trip.js rerun "<name>" [--categories flights,hotels,vacation-packages]
`;

function readDb() {
  return new DatabaseSync(DB_PATH, { readOnly: true });
}

// ── save ────────────────────────────────────────────────────────────────────
function cmdSave(raw) {
  const errors = [];
  if (!raw.name) errors.push('--name is required');
  if (!raw.destination) errors.push('--destination is required');
  if (!raw.depart) errors.push('--depart is required');
  if (!raw.return) errors.push('--return is required');
  if (errors.length) {
    errors.forEach(e => console.error(`Error: ${e}`));
    console.error(USAGE);
    process.exit(1);
  }
  const slug = raw.slug || toSlug(raw.destination);
  const id = upsertTrip({
    trip: raw.name,
    slug,
    destination: raw.destination,
    origin: raw.origin || null,
    depart: raw.depart,
    return: raw.return,
    travelers: Number(raw.travelers || 1),
    rooms: Number(raw.rooms || 1),
  });
  closeDb();
  console.log(`Saved trip "${raw.name}" (id=${id}, slug=${slug}).`);
}

// ── list ────────────────────────────────────────────────────────────────────
function cmdList() {
  const db = readDb();
  const rows = db.prepare(`
    SELECT t.id, t.name, t.destination, t.origin, t.depart, t.return,
           t.travelers, t.rooms, t.updated_at,
           (SELECT MAX(searched_at) FROM searches WHERE trip_id = t.id) AS last_search_at
    FROM trips t
    ORDER BY COALESCE(t.name, t.destination), t.depart
  `).all();
  if (!rows.length) {
    console.log('No saved trips. Use /trip-save to create one.');
    return;
  }
  for (const r of rows) {
    const last = r.last_search_at ? r.last_search_at.slice(0, 10) : 'never';
    console.log(
      `[${r.id}] ${r.name || '(unnamed)'}\n` +
      `    ${r.destination}${r.origin ? ` ← ${r.origin}` : ''}\n` +
      `    ${r.depart} → ${r.return} | ${r.travelers} travelers${r.rooms > 1 ? `, ${r.rooms} rooms` : ''}\n` +
      `    last searched: ${last}`
    );
  }
}

// ── rerun ───────────────────────────────────────────────────────────────────
async function cmdRerun(name, raw) {
  if (!name) {
    console.error('Error: trip name is required');
    console.error(USAGE);
    process.exit(1);
  }
  const db = readDb();
  const trip = db.prepare('SELECT * FROM trips WHERE name = ? LIMIT 1').get(name);
  db.close();
  if (!trip) {
    console.error(`No saved trip named "${name}". Use /trip-list to see available trips.`);
    process.exit(1);
  }

  const categories = (raw.categories
    ? String(raw.categories).split(',').map(s => s.trim())
    : (trip.origin ? ['flights', 'hotels', 'vacation-packages'] : ['hotels'])
  ).filter(Boolean);

  console.log(`Re-running "${trip.name}" — ${categories.join(', ')}...\n`);

  const searchScript = path.join(__dirname, 'search.js');
  for (const category of categories) {
    if ((category === 'flights' || category === 'vacation-packages') && !trip.origin) {
      console.log(`  Skipping ${category} — no origin saved on this trip.`);
      continue;
    }
    const args = [
      searchScript, category,
      '--trip', trip.name,
      '--destination', trip.destination,
      '--depart', trip.depart,
      '--return', trip.return,
      '--travelers', String(trip.travelers),
      '--rooms', String(trip.rooms),
    ];
    if (trip.origin) args.push('--origin', trip.origin);
    console.log(`\n── ${category} ─────────────────────────`);
    await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, args, { stdio: 'inherit' });
      p.on('exit', code => code === 0 ? resolve() : reject(new Error(`${category} exited with code ${code}`)));
    }).catch(err => console.error(`  ${err.message}`));
  }
  console.log('\nDone re-running trip.');
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  const argv = minimist(process.argv.slice(2));
  const subcommand = argv._[0];
  const positional = argv._.slice(1).join(' ');
  if (subcommand === 'save')  return cmdSave(argv);
  if (subcommand === 'list')  return cmdList();
  if (subcommand === 'rerun') return cmdRerun(positional, argv);
  console.error(USAGE);
  process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error(err.message); process.exit(1); });
