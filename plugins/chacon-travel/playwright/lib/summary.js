import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './data-dir.js';

const TRAVEL_PLANS_DIR = DATA_DIR;

function categoryLabel(category) {
  if (category === 'flights') return 'Flights';
  if (category === 'hotels') return 'Hotels';
  return 'Vacation Packages';
}

/**
 * Finds the best result from a results array (lowest total cost, non-error).
 */
function findBest(results, category) {
  const valid = results.filter(r => !r.error);
  if (!valid.length) return null;

  // Sort by numeric total (strip non-numeric except digits and decimal)
  const toNum = str => parseFloat(String(str).replace(/[^0-9.]/g, '') || '0');
  const sorted = [...valid].sort((a, b) => toNum(a.total) - toNum(b.total));
  return sorted[0];
}

function buildBestDescription(best, category, params) {
  if (!best) return '—';
  if (category === 'flights') {
    return `${best.airline} (${best.site})`;
  } else if (category === 'hotels') {
    return `${best.property} (${best.site})`;
  } else {
    return `${best.packageName} (${best.site})`;
  }
}

function buildPerPerson(best, category) {
  if (!best) return '—';
  return best.perPerson || '—';
}

function buildTotal(best) {
  if (!best) return '—';
  return best.total || '—';
}

/**
 * Creates a default summary.md content for a new destination.
 */
function defaultSummary(params, label) {
  const tripLabel = params.origin
    ? `${params.origin} → ${params.destination} | ${params.depart}–${params.return} | ${params.travelers} Travelers`
    : `${params.destination} | ${params.depart}–${params.return} | ${params.travelers} Travelers`;

  return `# ${params.destination} — Travel Cost Summary

**Trip:** ${tripLabel}

---

## Latest Prices

| Category | Best Option | Per Person | Total (${params.travelers}) | Last Searched |
|---|---|---|---|---|
| Flights | — | — | — | — |
| Hotels | — | — | — | — |
| Vacation Packages | — | — | — | — |

---

## Price History

### Flights
| Date | Best Option | Per Person | Total (${params.travelers}) | Change |
|---|---|---|---|---|
| — | — | — | — | — |

### Hotels
| Date | Best Option | Per Person | Total | Change |
|---|---|---|---|---|
| — | — | — | — | — |

### Vacation Packages
| Date | Best Option | Per Person | Total | Change |
|---|---|---|---|---|
| — | — | — | — | — |

---

## Search History
`;
}

/**
 * Updates the Latest Prices row for a given category.
 * Replaces the matching row in the table.
 */
function updateLatestPrices(content, label, bestDesc, perPerson, total, date) {
  const lines = content.split('\n');
  const updated = lines.map(line => {
    if (line.startsWith(`| ${label} |`)) {
      return `| ${label} | ${bestDesc} | ${perPerson} | ${total} | ${date} |`;
    }
    return line;
  });
  return updated.join('\n');
}

/**
 * Appends a row to the Price History table for the given category.
 * Finds the section header "### Flights" etc. and inserts before the next "###" or end.
 */
function appendPriceHistory(content, label, date, bestDesc, perPerson, total) {
  const lines = content.split('\n');
  const sectionHeader = `### ${label}`;
  let inSection = false;
  let insertIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === sectionHeader) {
      inSection = true;
      continue;
    }
    if (inSection) {
      // Find the last table row in this section
      if (lines[i].startsWith('|')) {
        insertIdx = i;
      } else if (lines[i].startsWith('###') || lines[i].startsWith('---')) {
        break;
      }
    }
  }

  if (insertIdx === -1) return content; // section not found, leave as-is

  const prevRow = lines[insertIdx];

  // Calculate change vs previous
  const toNum = str => parseFloat(String(str).replace(/[^0-9.]/g, '') || '0');
  const prevTotal = toNum(prevRow.split('|')[4] || '0');
  const currTotal = toNum(total);
  let change = '—';
  if (prevRow.includes('—') || prevTotal === 0) {
    change = '— (first search)';
  } else {
    const diff = currTotal - prevTotal;
    change = diff === 0 ? 'No change' : (diff > 0 ? `+$${diff.toFixed(0)}` : `-$${Math.abs(diff).toFixed(0)}`);
  }

  const newRow = `| ${date} | ${bestDesc} | ${perPerson} | ${total} | ${change} |`;
  lines.splice(insertIdx + 1, 0, newRow);
  return lines.join('\n');
}

/**
 * Appends a Search History entry.
 */
function appendSearchHistory(content, category, date) {
  const entry = `- \`${category}/processed=${date}/results.md\` — Searched via Playwright`;
  // Append before end of file
  return content.trimEnd() + '\n' + entry + '\n';
}

/**
 * Updates summary.md for a destination with the latest search results.
 */
export function updateSummary({ params, results, date }) {
  const summaryPath = path.join(TRAVEL_PLANS_DIR, params.slug, 'summary.md');
  const label = categoryLabel(params.category);

  // Read or create
  let content;
  if (fs.existsSync(summaryPath)) {
    content = fs.readFileSync(summaryPath, 'utf8');
  } else {
    fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
    content = defaultSummary(params, label);
  }

  const best = findBest(results, params.category);
  const bestDesc = buildBestDescription(best, params.category, params);
  const perPerson = buildPerPerson(best, params.category);
  const total = buildTotal(best);

  content = updateLatestPrices(content, label, bestDesc, perPerson, total, date);
  content = appendPriceHistory(content, label, date, bestDesc, perPerson, total);
  content = appendSearchHistory(content, params.category, date);

  fs.writeFileSync(summaryPath, content, 'utf8');
  return summaryPath;
}
