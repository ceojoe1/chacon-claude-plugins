import { parseArgs } from './lib/args.js';
import { launchBrowser, newStealthContext } from './lib/browser.js';
import { writeResults } from './lib/writer.js';
import { updateSummary } from './lib/summary.js';

const SITE_REGISTRY = {
  flights: [
    () => import('../plugins/chacon-travel/playwright/flights/google-flights.js'),
    () => import('../plugins/chacon-travel/playwright/flights/southwest.js'),
    () => import('../plugins/chacon-travel/playwright/flights/expedia.js'),
    () => import('../plugins/chacon-travel/playwright/flights/kayak.js'),
  ],
  hotels: [
    () => import('../plugins/chacon-travel/playwright/hotels/google-hotels.js'),
    () => import('../plugins/chacon-travel/playwright/hotels/expedia.js'),
    () => import('../plugins/chacon-travel/playwright/hotels/kayak.js'),
    () => import('../plugins/chacon-travel/playwright/hotels/costco-travel.js'),
    () => import('../plugins/chacon-travel/playwright/hotels/vrbo.js'),
    () => import('../plugins/chacon-travel/playwright/hotels/airbnb.js'),
  ],
  'vacation-packages': [
    () => import('../plugins/chacon-travel/playwright/vacation-packages/southwest-vacations.js'),
    () => import('../plugins/chacon-travel/playwright/vacation-packages/costco-travel.js'),
    () => import('../plugins/chacon-travel/playwright/vacation-packages/expedia.js'),
    () => import('../plugins/chacon-travel/playwright/vacation-packages/kayak.js'),
  ],
};

async function main() {
  const params = parseArgs(process.argv);
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  console.log(`\nvacAI Search — ${params.category}`);
  console.log(`Destination: ${params.destination} | ${params.depart} → ${params.return} | ${params.travelers} travelers`);
  if (params.origin) console.log(`Origin: ${params.origin}`);
  console.log(`Mode: ${params.headed ? 'headed (visible browser)' : 'headless'} | ${params.parallel ? 'parallel' : 'sequential'}\n`);

  // Load all site modules first so we can filter by siteName
  const allLoaders = SITE_REGISTRY[params.category];
  const allModules = await Promise.all(allLoaders.map(load => load()));

  let siteModules = allModules;
  if (params.sitesFilter.length > 0) {
    siteModules = allModules.filter(mod =>
      params.sitesFilter.some(f => mod.default.siteName?.toLowerCase().includes(f))
    );
    if (siteModules.length === 0) {
      console.error(`No sites matched filter: ${params.sitesFilter.join(', ')}`);
      console.error(`Available: ${allModules.map(m => m.default.siteName).join(', ')}`);
      process.exit(1);
    }
    console.log(`Sites filter: ${siteModules.map(m => m.default.siteName).join(', ')}\n`);
  }

  const browser = await launchBrowser({ headed: params.headed });

  /** Run one site search with its own browser context and a timeout guard. */
  async function runSite(mod) {
    const searchFn = mod.default;
    const context = await newStealthContext(browser);
    try {
      console.log(`  Searching ${searchFn.siteName || '...'}...`);
      const result = await Promise.race([
        searchFn(context, params),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), params.timeout)
        ),
      ]);
      return result;
    } catch (err) {
      return { site: searchFn.siteName || 'Unknown', error: err.message };
    } finally {
      await context.close().catch(() => {});
    }
  }

  // Run sites in parallel (default) or sequentially (--no-parallel)
  let rawResults;
  if (params.parallel) {
    const settled = await Promise.allSettled(siteModules.map(mod => runSite(mod)));
    rawResults = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { site: siteModules[i].default.siteName || 'Unknown', error: s.reason?.message || 'Unknown error' }
    );
  } else {
    rawResults = [];
    for (const mod of siteModules) {
      rawResults.push(await runSite(mod));
    }
  }

  // Log outcomes and flatten multi-result responses
  const allResults = [];
  for (const result of rawResults) {
    if (result.error) {
      console.log(`    ✗ ${result.site}: ${result.error}`);
    } else {
      const count = Array.isArray(result.results) ? result.results.length : 1;
      console.log(`    ✓ ${result.site}: ${count} result(s)`);
    }

    if (result.results && Array.isArray(result.results)) {
      for (const r of result.results) {
        allResults.push({ site: result.site, ...r });
      }
    } else {
      allResults.push(result);
    }
  }

  if (params.pause > 0) {
    console.log(`\nPausing ${params.pause}s — close the browser when done viewing...`);
    await new Promise(r => setTimeout(r, params.pause * 1000));
  }

  await browser.close();

  console.log('\nWriting results...');
  const resultsPath = writeResults({ params, results: allResults, date: today });
  console.log(`  Results: ${resultsPath}`);

  const summaryPath = updateSummary({ params, results: allResults, date: today });
  console.log(`  Summary: ${summaryPath}`);

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
