import minimist from 'minimist';

const CATEGORIES = ['flights', 'hotels', 'vacation-packages'];

const USAGE = `
Usage: node search.js <category> [options]

  category       flights | hotels | vacation-packages

Options:
  --origin       Departure city/airport (required for flights + vacation-packages)
  --destination  Destination city or area  [required]
  --depart       Departure / check-in date YYYY-MM-DD  [required]
  --return       Return / check-out date YYYY-MM-DD  [required]
  --travelers    Number of travelers (default: 1)
  --rooms        Number of rooms (default: 1, hotels only)
  --slug         Override destination folder slug (e.g. orlando-fl)
  --sites        Comma-separated list of sites to run (default: all)
                 e.g. --sites "Google Flights,Expedia"
  --trip         Trip label (e.g. "databricks ai summit") for results table
  --anchor       Landmark/experience to use as the geocoding origin for hotel
                 distance calculation (e.g. "Islands of Adventure"). Falls back
                 to the destination if not provided.
  --max-hotels   Max hotels to drill into (hotels only, default: 8)
  --export       Also write .md/.csv files alongside SQLite (default: false)
  --debug        Verbose scraper logging (per-click traces). Default: false.
  --headed       Launch visible browser (default: headless)
  --timeout      Per-site timeout ms (default: 120000)
  --pause        Keep browser open N seconds after search (default: 0, implies --headed)
  --no-parallel  Run sites sequentially instead of in parallel (default: parallel on)

Examples:
  node search.js flights --origin ABQ --destination "Orlando, FL" --depart 2026-07-10 --return 2026-07-17 --travelers 4
  node search.js hotels --destination "Orlando, FL" --depart 2026-07-10 --return 2026-07-17 --travelers 4
  node search.js vacation-packages --origin ABQ --destination "Orlando, FL" --depart 2026-07-10 --return 2026-07-17 --travelers 4
`;

/**
 * Derives a folder-safe destination slug.
 * "Orlando, FL" → "orlando-fl"
 * "San Diego, CA" → "san-diego-ca"
 */
export function toSlug(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Parses and validates CLI arguments.
 * Returns a normalized params object or exits 1 on error.
 */
export function parseArgs(argv) {
  const raw = minimist(argv.slice(2), {
    string: ['origin', 'destination', 'depart', 'return', 'slug', 'sites', 'trip', 'anchor'],
    boolean: ['headed', 'parallel', 'export', 'debug'],
    default: {
      travelers: 1,
      rooms: 1,
      timeout: 600000,
      headed: false,
      pause: 0,
      sites: '',
      trip: '',
      anchor: '',
      'max-hotels': 8,
      export: false,
      debug: false,
      parallel: true,
    },
  });

  const category = raw._[0];

  const errors = [];

  if (!category || !CATEGORIES.includes(category)) {
    console.error(`Error: category must be one of: ${CATEGORIES.join(', ')}`);
    console.error(USAGE);
    process.exit(1);
  }

  if (!raw.destination) errors.push('--destination is required');
  if (!raw.depart) errors.push('--depart is required');
  if (!raw.return) errors.push('--return is required');
  if ((category === 'flights' || category === 'vacation-packages') && !raw.origin) {
    errors.push(`--origin is required for ${category}`);
  }

  if (errors.length > 0) {
    errors.forEach(e => console.error(`Error: ${e}`));
    console.error(USAGE);
    process.exit(1);
  }

  const slug = raw.slug || toSlug(raw.destination);

  // Parse --sites into a lowercase filter list, e.g. "Google Flights,Expedia" → ['google flights','expedia']
  const sitesFilter = raw.sites
    ? raw.sites.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];

  return {
    category,
    origin: raw.origin || null,
    destination: raw.destination,
    depart: raw.depart,
    return: raw.return,
    travelers: Number(raw.travelers),
    rooms: Number(raw.rooms),
    trip: raw.trip || '',
    anchor: raw.anchor || '',
    maxHotels: Number(raw['max-hotels']),
    export: !!raw.export,
    debug: !!raw.debug,
    slug,
    sitesFilter,
    headed: raw.headed || Number(raw.pause) > 0,
    pause: Number(raw.pause),
    timeout: Number(raw.timeout),
    parallel: raw.parallel,
  };
}
