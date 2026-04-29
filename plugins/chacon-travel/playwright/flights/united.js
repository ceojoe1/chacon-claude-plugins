import { humanDelay, detectCaptcha, selectAutocomplete, inferFareIncludes } from '../sites/helpers.js';

const SITE = 'United';
const HOME_URL = 'https://www.united.com';

// Extract a 3-letter IATA code from inputs like "Phoenix, AZ (PHX)" or "ABQ".
// Returns null if not found.
function extractAirportCode(input) {
  if (!input) return null;
  const paren = input.match(/\(([A-Z]{3})\)/);
  if (paren) return paren[1];
  if (/^[A-Z]{3}$/i.test(input.trim())) return input.trim().toUpperCase();
  return null;
}

// Build a direct results-page URL when both endpoints are airport codes —
// bypasses the homepage form entirely. Format derived from united.com/en/us/fsr.
//
// Critical params (don't change without testing — wrong values cause United to
// load the search shell but never actually fire the search backend):
//   tt=0   — Round-trip (NOT 1 = one-way)
//   sc=7,7 — Cabin class for both legs (Economy,Economy); single "7" gets
//            interpreted as a malformed RT request and stalls forever.
//   tqp=R  — Round-trip query parameter
//   mm=0   — Money mode (vs miles), avoids the "Continue shopping?" modal in
//            many cases by pre-selecting cash pricing
//   px     — passenger count
function buildDirectUrl(originCode, destCode, depart, ret, travelers) {
  const params = new URLSearchParams({
    f: originCode,
    t: destCode,
    d: depart,
    r: ret,
    sc: '7,7',
    px: String(travelers),
    taxng: '1',
    newHP: 'True',
    clm: '7',
    st: 'bestmatches',
    tt: '0',
    tqp: 'R',
    mm: '0',
    idx: '1',
  });
  return `https://www.united.com/en/us/fsr/choose-flights?${params}`;
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    const originCode = extractAirportCode(params.origin);
    const destCode = extractAirportCode(params.destination);
    const useDirect = originCode && destCode;

    if (useDirect) {
      const url = buildDirectUrl(originCode, destCode, params.depart, params.return, params.travelers);
      console.log(`      [UA] direct URL: ${url.substring(0, 120)}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    } else {
      await page.goto(HOME_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    }
    await humanDelay(2000, 3000);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: `CAPTCHA: ${_cap} (retry with --headed to solve manually)` };
    }

    if (!useDirect) {
      // Form-fill path (origin/dest are city names, not codes)
      const originField = page.locator('#bookFlightOriginInput, input[name="OriginInput"], [aria-label*="From"]').first();
      await originField.click({ timeout: 8000 });
      await humanDelay(300, 500);
      await page.keyboard.press('Control+a');
      await page.keyboard.type(params.origin, { delay: 80 });
      await selectAutocomplete(page).catch(() => {});
      await humanDelay(400, 600);

      const destField = page.locator('#bookFlightDestinationInput, input[name="DestinationInput"], [aria-label*="To"]').first();
      await destField.click({ timeout: 8000 });
      await humanDelay(300, 500);
      await page.keyboard.press('Control+a');
      await page.keyboard.type(params.destination, { delay: 80 });
      await selectAutocomplete(page).catch(() => {});
      await humanDelay(400, 600);

      // Depart date — United uses a calendar; click input then type MM/DD/YYYY
      const [dy, dm, dd] = params.depart.split('-');
      const [ry, rm, rdy] = params.return.split('-');
      const departField = page.locator('#DepartDate, [aria-label*="Depart date"], input[name="DepartDate"]').first();
      await departField.click({ clickCount: 3, timeout: 5000 }).catch(() => {});
      await humanDelay(200, 400);
      await page.keyboard.type(`${dm}/${dd}/${dy}`, { delay: 60 });
      await humanDelay(300, 500);

      const returnField = page.locator('#ReturnDate, [aria-label*="Return date"], input[name="ReturnDate"]').first();
      await returnField.click({ clickCount: 3, timeout: 5000 }).catch(() => {});
      await humanDelay(200, 400);
      await page.keyboard.type(`${rm}/${rdy}/${ry}`, { delay: 60 });
      await humanDelay(300, 500);
      await page.keyboard.press('Escape');

      // Submit
      await page.locator('button[type="submit"], button:has-text("Find flights")').first().click();
    }

    // Wait for results page to settle
    await page.waitForURL(/choose-flights|fsr|search/i, { timeout: 30_000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(3000, 4500);

    // Dismiss United's "Continue shopping?" modal that asks whether to show
    // results in dollars vs MileagePlus miles. It blocks the results UI until
    // the user picks "Show flights with money".
    const moneyBtn = page.locator('button:has-text("Show flights with money"), [role="button"]:has-text("Show flights with money")').first();
    if (await moneyBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log(`      [UA] dismissing "Continue shopping?" modal`);
      await moneyBtn.click().catch(() => {});
      await humanDelay(1500, 2500);
    }

    // United's results sometimes get stuck on "Loading results..." when navigated
    // via direct URL — clicking "Update" on the search-criteria bar re-fires the
    // search and unsticks the spinner.
    const updateBtn = page.locator('button:has-text("Update"), [role="button"]:has-text("Update")').first();
    if (await updateBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await updateBtn.click().catch(() => {});
      console.log(`      [UA] clicked "Update" to re-fire search`);
      await humanDelay(2000, 3000);
    }

    // Wait for actual flight prices to render. United's search backend is slow
    // (10-30s) and sometimes silently refuses headless requests. Polling for $NNN
    // prices is more reliable than a fixed delay. We also exit early if United
    // returns its "unable to complete your request" server-side block.
    const outcome = await page.waitForFunction(() => {
      const text = document.body.innerText || '';
      if (/unable to complete your request/i.test(text)) return 'BLOCKED';
      const stillLoading = /Loading results\.\.\./i.test(text);
      const hasPrices = (text.match(/\$\d{2,4}\b/g) || []).length >= 3;
      if (!stillLoading && hasPrices) return 'OK';
      return false;
    }, { timeout: 50_000 }).then(h => h.jsonValue()).catch(() => null);

    if (outcome === 'BLOCKED') {
      return { site: SITE, error: 'United refused the request ("unable to complete") — server-side bot block. Retry later or use the /flights skill MCP fallback.' };
    }
    if (outcome !== 'OK') {
      return { site: SITE, error: 'Results never loaded — United may be silently blocking automation (try a different IP or run via /flights skill)' };
    }
    await humanDelay(1000, 1500);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: `CAPTCHA: ${_cap2} (retry with --headed to solve manually)` };
    }

    // --- Extract fare cards ---
    // United results show each itinerary with departure/return times, duration, stops, and a price.
    // Strategy: find leaf $X[,XXX] price elements, walk up to the card, parse time/stops/airline.
    const priceEls = await page.locator('*').filter({ hasText: /^\$[\d,]{2,7}$/ }).all();
    console.log(`      [UA] price elements found: ${priceEls.length}`);

    const results = [];
    const seenCards = new Set();

    for (const el of priceEls) {
      const cardText = await el.evaluate(e => {
        let p = e;
        for (let i = 0; i < 10 && p; i++, p = p.parentElement) {
          const text = p.innerText || '';
          if (/\d{1,2}:\d{2}\s*[AP]M/i.test(text) && /(Nonstop|stop|hr)/i.test(text)) {
            return text.replace(/\s+/g, ' ').trim();
          }
        }
        return null;
      }).catch(() => null);

      if (!cardText || seenCards.has(cardText)) continue;
      seenCards.add(cardText);

      const priceMatch = cardText.match(/\$([\d,]+)/);
      const priceRaw = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, '')) : null;
      if (!priceRaw || priceRaw < 80 || priceRaw > 20000) continue;

      // United typically shows per-person totals already
      const perPerson = priceRaw;
      const groupTotal = priceRaw * params.travelers;

      const stopsMatch = cardText.match(/Nonstop|\d+\s*stop/i);
      const stops = stopsMatch ? stopsMatch[0] : '—';

      const timesMatch = cardText.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–\-to]+\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      const route = timesMatch ? `${timesMatch[1]} – ${timesMatch[2]}` : '—';

      console.log(`      [UA card] $${priceRaw} | ${stops} | ${route}`);

      const pp = '$' + perPerson.toLocaleString('en-US') + ' RT';
      const total = '$' + groupTotal.toLocaleString('en-US');

      if (results.some(r => r.perPerson === pp && r.stops === stops && r.route === route)) continue;

      const includes = inferFareIncludes(cardText, 'United');
      results.push({ airline: 'United', route, stops, includes, perPerson: pp, total });
      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      // Diagnostic dump
      try {
        const fsSync = (await import('fs')).default;
        const bodyText = await page.locator('body').textContent({ timeout: 3000 }).catch(() => '');
        fsSync.writeFileSync('united-diag.txt', `URL: ${page.url()}\nPrice elements found: ${priceEls.length}\n\n--- BODY TEXT (4000 chars) ---\n${(bodyText || '').slice(0, 4000)}`);
        await page.screenshot({ path: 'united-diag.png', fullPage: true }).catch(() => {});
      } catch {}
      return { site: SITE, error: 'No results found — United may have changed its UI or blocked the request' };
    }

    return { site: SITE, results };

  } catch (err) {
    return { site: SITE, error: err.message };
  } finally {
    await page.close();
  }
}

search.siteName = SITE;
export default search;
