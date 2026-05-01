import { parseArgs } from './lib/args.js';
import { launchBrowser, newStealthContext } from './lib/browser.js';
import { writeResults } from './lib/writer.js';
import { updateSummary } from './lib/summary.js';

const SITE_REGISTRY = {
  flights: [
    () => import('./flights/google-flights.js'),
    () => import('./flights/southwest.js'),
    () => import('./flights/expedia.js'),
    () => import('./flights/kayak.js'),
    () => import('./flights/united.js'),
  ],
  hotels: [
    () => import('./hotels/google-hotels.js'),
    () => import('./hotels/expedia.js'),
    () => import('./hotels/kayak.js'),
    () => import('./hotels/costco-travel.js'),
    () => import('./hotels/vrbo.js'),
    () => import('./hotels/airbnb.js'),
  ],
  'vacation-packages': [
    () => import('./vacation-packages/southwest-vacations.js'),
    () => import('./vacation-packages/costco-travel.js'),
    () => import('./vacation-packages/expedia.js'),
    () => import('./vacation-packages/kayak.js'),
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

  // Compute window tile layout for headed parallel runs (e.g., 3 sites
  // side-by-side). Headless or single-site → no tiling, share one browser.
  const tileLayout = (params.headed && params.parallel && siteModules.length > 1)
    ? computeTiles(siteModules.length)
    : null;

  // When tiling, each site gets its own browser launch (so its window has its
  // own position/size args). Otherwise share one browser across all contexts.
  const sharedBrowser = tileLayout ? null : await launchBrowser({ headed: params.headed });
  const perSiteBrowsers = [];

  /** Run one site search with its own browser context and a timeout guard. */
  async function runSite(mod, idx) {
    const searchFn = mod.default;
    let browser;
    if (tileLayout) {
      const tile = tileLayout[idx];
      browser = await launchBrowser({ headed: true, window: tile });
      perSiteBrowsers.push(browser);
    } else {
      browser = sharedBrowser;
    }
    // Keep viewport at the default 1440x900 so sites render their desktop
    // layout regardless of window size. The window itself is tiled smaller
    // but the page sees a full-width viewport (with internal scroll).
    const context = await newStealthContext(browser);
    // Belt-and-suspenders: enforce window position/size at runtime via CDP
    // since Chrome sometimes ignores --window-position / --window-size launch
    // args. Apply on every new page in this context.
    if (tileLayout) {
      const tile = tileLayout[idx];
      // Compute zoom so the 1440px viewport scales to fit the tile width,
      // leaving a small margin for scrollbars / chrome.
      const zoom = Math.min(1, (tile.width - 20) / 1440);
      // Apply zoom to every navigated page via init script.
      await context.addInitScript(z => {
        document.documentElement.style.zoom = z;
      }, zoom);
      context.on('page', async page => {
        try {
          const session = await context.newCDPSession(page);
          const { windowId } = await session.send('Browser.getWindowForTarget');
          await session.send('Browser.setWindowBounds', {
            windowId,
            bounds: { left: tile.x, top: tile.y, width: tile.width, height: tile.height, windowState: 'normal' },
          });
        } catch {/* CDP not always available — falls back to launch args */}
      });
    }
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

  /** Tile N windows across a 1920x1080 screen (typical desktop). */
  function computeTiles(n) {
    const screenW = 1920, screenH = 1040; // leave taskbar room
    const w = Math.floor(screenW / n);
    return Array.from({ length: n }, (_, i) => ({
      x: i * w,
      y: 0,
      width: w,
      height: screenH,
    }));
  }

  // Run sites in parallel (default) or sequentially (--no-parallel)
  let rawResults;
  if (params.parallel) {
    const settled = await Promise.allSettled(siteModules.map((mod, i) => runSite(mod, i)));
    rawResults = settled.map((s, i) =>
      s.status === 'fulfilled'
        ? s.value
        : { site: siteModules[i].default.siteName || 'Unknown', error: s.reason?.message || 'Unknown error' }
    );
  } else {
    rawResults = [];
    for (let i = 0; i < siteModules.length; i++) {
      rawResults.push(await runSite(siteModules[i], i));
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

  if (sharedBrowser) await sharedBrowser.close().catch(() => {});
  await Promise.all(perSiteBrowsers.map(b => b.close().catch(() => {})));

  console.log('\nWriting results...');
  const resultsPath = writeResults({ params, results: allResults, date: today });
  console.log(`  Results: ${resultsPath}`);

  const summaryPath = updateSummary({ params, results: allResults, date: today });
  console.log(`  Summary: ${summaryPath}`);

  console.log('\nDone.\n');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
