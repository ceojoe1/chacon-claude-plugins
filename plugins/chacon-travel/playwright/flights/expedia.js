import { humanDelay, detectCaptcha, waitForCaptchaSolve, parsePrice } from '../sites/helpers.js';

const SITE = 'Expedia';

// Build direct search URL — bypasses form interactions entirely
function buildUrl(params) {
  const fmt = d => { const [y,m,day] = d.split('-'); return `${m}/${day}/${y}`; };
  return (
    'https://www.expedia.com/Flights-Search?' +
    `trip=roundtrip` +
    `&leg1=from:${encodeURIComponent(params.origin)},to:${encodeURIComponent(params.destination)},departure:${fmt(params.depart)}TANYT` +
    `&leg2=from:${encodeURIComponent(params.destination)},to:${encodeURIComponent(params.origin)},departure:${fmt(params.return)}TANYT` +
    `&passengers=adults:${params.travelers},children:0,infantinlap:Y` +
    `&options=cabinclass:coach` +
    `&mode=search`
  );
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    // Warm up session on Expedia homepage first to acquire cookies before search URL
    await page.goto('https://www.expedia.com', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await humanDelay(2000, 3000);
    await page.goto(buildUrl(params), { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for flight cards to appear — Expedia embeds invisible CAPTCHA iframes even
    // on valid result pages (for sign-in widget), so check results BEFORE checking CAPTCHA
    await page.waitForSelector('[class*="uitk-card"]', { timeout: 25_000 }).catch(() => {});
    await humanDelay(1500, 2500);

    const hasResults = await page.locator('[class*="uitk-card"]').filter({ hasText: /\$\d/ }).count();
    if (hasResults === 0) {
      const _cap = await detectCaptcha(page);
      if (_cap) {
        const isHardBlock = ['blocked', 'human side', "can't tell"].some(s => _cap.includes(s));
        if (params.headed && !isHardBlock) {
          const solved = await waitForCaptchaSolve(page);
          if (!solved) return { site: SITE, error: 'CAPTCHA not solved — use /flights skill instead' };
        } else {
          return { site: SITE, error: 'CAPTCHA: ' + _cap + (isHardBlock ? ' (DataDome — use /flights skill)' : '') };
        }
      } else {
        return { site: SITE, error: 'No results found' };
      }
    }

    // Extract results — prices shown as "Roundtrip per traveler"
    const results = [];

    // Flight cards contain airline name, times, stops, and per-person price
    const cards = await page.locator('[class*="uitk-card"]')
      .filter({ hasText: /Roundtrip per traveler|\$\d/ })
      .all();

    for (const card of cards.slice(0, 3)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      // Skip non-flight cards (ads, promos)
      if (!cardText.match(/ABQ|Albuquerque|MCO|Orlando/i)) continue;

      // Price: "Roundtrip per traveler" label appears near the price
      const priceMatch = cardText.match(/\$(\d[\d,]+)/);
      if (!priceMatch) continue;

      const ppNum = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (ppNum < 100 || ppNum > 5000) continue;
      const groupNum = ppNum * params.travelers;

      const airline = cardText.match(/United|Southwest|American|Delta|JetBlue|Alaska|Spirit|Frontier/i)?.[0] || 'See Expedia';
      const stopsMatch = cardText.match(/Nonstop|\d\+? stop/i);
      const stops = stopsMatch ? stopsMatch[0] : '—';
      const durationMatch = cardText.match(/(\d+h\s*\d+m)/);
      const duration = durationMatch ? durationMatch[1] : '';
      const route = duration ? `${params.depart} → ${params.return} (${duration})` : `${params.depart} → ${params.return}`;

      // Deduplicate — skip if same airline + price already captured
      const dedupKey = `${airline}:${ppNum}`;
      if (results.some(r => r._key === dedupKey)) continue;

      results.push({
        _key: dedupKey,
        airline,
        route,
        stops,
        perPerson: '$' + ppNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' RT',
        total: '$' + groupNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      });

      if (results.length >= 2) break;
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results parsed — selectors may need updating' };
    }

    // Strip internal dedup keys before returning
    results.forEach(r => delete r._key);
    return { site: SITE, results };

  } catch (err) {
    return { site: SITE, error: err.message };
  } finally {
    await page.close();
  }
}

search.siteName = SITE;
export default search;
