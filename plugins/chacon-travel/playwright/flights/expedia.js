import { humanDelay, detectCaptcha, waitForCaptchaSolve, inferFareIncludes, extractIATA } from '../sites/helpers.js';
import { bagFeesForTrip } from '../lib/bag-fees.js';

const SITE = 'Expedia';

// Carriers we drill into per the debugging/expedia.md spec. Other airlines
// (Spirit, Frontier, JetBlue, Alaska, etc.) are skipped — Expedia's modal
// fare-tier names diverge enough per carrier that we'd need per-carrier rules
// to match cleanly. Keep the working set small and reliable.
const SUPPORTED_CARRIERS = {
  WN: { name: 'Southwest',  preferredTier: /\bChoice\b/i },
  UA: { name: 'United',     preferredTier: /\bEconomy\b/i },
  DL: { name: 'Delta',      preferredTier: /Main\s*Classic/i },
  AA: { name: 'American',   preferredTier: /Main\s*Cabin/i },
};

// Simple search URL — the long filter-laden variant from debugging/expedia.md
// triggers Akamai bot protection ("Access Denied") on fresh sessions. We
// still get the same departing-card click flow with a less aggressive URL.
function buildUrl(params) {
  const fmt = d => { const [y, m, day] = d.split('-'); return `${m}/${day}/${y}`; };
  return (
    'https://www.expedia.com/Flights-Search?' +
    `trip=roundtrip` +
    `&leg1=from:${encodeURIComponent(params.origin)},to:${encodeURIComponent(params.destination)},departure:${fmt(params.depart)}TANYT` +
    `&leg2=from:${encodeURIComponent(params.destination)},to:${encodeURIComponent(params.origin)},departure:${fmt(params.return)}TANYT` +
    `&passengers=adults:${params.travelers},children:0,infantinlap:N` +
    `&options=cabinclass:coach` +
    `&mode=search`
  );
}

// Detect carrier from the card text. Returns { code, name } or null.
function detectCarrier(text) {
  const t = text.toLowerCase();
  if (/\bsouthwest\b/.test(t)) return { code: 'WN', name: 'Southwest' };
  if (/\bunited\b/.test(t))    return { code: 'UA', name: 'United' };
  if (/\bdelta\b/.test(t))     return { code: 'DL', name: 'Delta' };
  if (/\bamerican\b/.test(t))  return { code: 'AA', name: 'American' };
  return null;
}

// Parse a flight card's text into structured fields. Used for both departing
// (search page) and returning (post-modal page) cards. Returning cards include
// pricing in the form "+$40 ... $509" — use the absolute "$509" total.
function parseCard(text) {
  // Expedia card text uses `6:00am 7:36am` (space separator) but the screen-
  // reader prefix "departing at 6:00am, arriving at 7:36am" is a fine fallback
  // since both forms surface the same two times. Accept any whitespace or
  // dash-like character between them.
  const timeM = text.match(/(\d{1,2}:\d{2}\s*[ap]m)[\s–\-,]+(?:arriving at\s+)?(\d{1,2}:\d{2}\s*[ap]m)(\+\d+)?/i);
  if (!timeM) return null;

  // Stops + duration: "2h 36m • Nonstop" or "4h 36m • 1 stop"
  const durM = text.match(/(\d+)h\s*(\d+)m/);
  const duration = durM ? `${durM[1]}h ${durM[2]}m` : null;
  const stopsM = text.match(/Nonstop|\d+\s*stop/i);
  const stops = stopsM ? stopsM[0] : '—';

  // Price: prefer the ABSOLUTE total (last $XXX in the card), since returning
  // cards lead with "+$40" deltas and follow with the real total like "$509".
  const allPrices = [...text.matchAll(/\$([\d,]+)/g)].map(m =>
    parseFloat(m[1].replace(/,/g, ''))
  );
  // Filter to plausible airfare range so we don't pick up "$40" deltas alone.
  const farePrices = allPrices.filter(p => p >= 100 && p <= 5000);
  const price = farePrices.length > 0 ? farePrices[farePrices.length - 1] : null;

  const timeRange = `${timeM[1]} – ${timeM[2]}${timeM[3] || ''}` + (duration ? ` (${duration})` : '');
  return { timeRange, stops, price };
}

// Wait for the fare-tier modal to render after clicking a departing card.
// Expedia uses uitk-sheet for the modal container; tier cards live inside.
async function waitForFareModal(page) {
  const modal = page.locator('[class*="uitk-sheet"], [role="dialog"]').filter({
    hasText: /Select fare to|Economy|Main Cabin|Choice|Basic/i,
  }).first();
  await modal.waitFor({ timeout: 15_000 }).catch(() => {});
  await humanDelay(800, 1500);
  return modal;
}

// Pick the right fare tier in the modal and click its Select button. Falls
// back to the cheapest tier if the preferred-tier regex doesn't match.
async function selectFareTier(page, modal, carrier) {
  // Each tier card has a "Select" button. Get all tier cards as text + button.
  const tierCards = await modal.locator('[class*="uitk-card"]').filter({
    hasText: /Select/i,
  }).all();

  if (tierCards.length === 0) {
    // No modal tiers — possibly only one fare. Just press any visible Select.
    const fallback = page.locator('button:has-text("Select")').first();
    if (await fallback.count().then(c => c > 0)) {
      await fallback.click({ timeout: 5_000 }).catch(() => {});
      return true;
    }
    return false;
  }

  // Pull tier text + price for each card so we can match preferredTier or
  // fall back to the cheapest.
  const tiers = [];
  for (let i = 0; i < tierCards.length; i++) {
    const text = await tierCards[i].innerText().catch(() => '');
    const flat = text.replace(/\s+/g, ' ').trim();
    const priceM = flat.match(/\$([\d,]+)/);
    const price = priceM ? parseFloat(priceM[1].replace(/,/g, '')) : Infinity;
    tiers.push({ index: i, text: flat, price });
  }

  let chosen = tiers.find(t => carrier.preferredTier.test(t.text));
  if (!chosen) {
    chosen = tiers.slice().sort((a, b) => a.price - b.price)[0];
  }

  const card = tierCards[chosen.index];
  const selectBtn = card.locator('button:has-text("Select")').first();
  await selectBtn.click({ timeout: 5_000 }).catch(() => {});
  return true;
}

// After selecting a fare tier, the page navigates to the returning-flights
// view. Wait for it and scrape the recommended returning cards.
async function scrapeReturning(page) {
  // Same list selector as the departing page — Expedia reuses the layout for
  // returning flights after a fare-tier selection.
  await page.locator('main div.uitk-spacing-margin-blockend-four > ul > li')
    .first().waitFor({ timeout: 20_000 }).catch(() => {});
  await humanDelay(2000, 3000);

  const cardTexts = await page.locator('main div.uitk-spacing-margin-blockend-four > ul > li')
    .evaluateAll(els => els.slice(0, 4).map(el => el.innerText.replace(/\s+/g, ' ').trim()))
    .catch(() => []);

  return cardTexts;
}

async function search(context, params) {
  const page = await context.newPage();
  const searchUrl = buildUrl(params);

  try {
    // Warm up cookies on the homepage first.
    await page.goto('https://www.expedia.com', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await humanDelay(2000, 3000);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for departing cards.
    await page.locator('main div.uitk-spacing-margin-blockend-four > ul > li')
      .first().waitFor({ timeout: 35_000 }).catch(() => {});
    await humanDelay(1500, 2500);

    // CAPTCHA / DataDome check.
    const hasCards = await page.locator('main div.uitk-spacing-margin-blockend-four > ul > li').count();
    if (hasCards === 0) {
      const cap = await detectCaptcha(page);
      if (cap) {
        if (params.headed) {
          // Headed mode — give the user a chance to solve, even DataDome.
          const solved = await waitForCaptchaSolve(page);
          if (!solved) return { site: SITE, error: 'CAPTCHA not solved: ' + cap };
          // After solve, wait for cards to render.
          await page.locator('main div.uitk-spacing-margin-blockend-four > ul > li')
            .first().waitFor({ timeout: 20_000 }).catch(() => {});
          await humanDelay(1500, 2000);
        } else {
          return { site: SITE, error: 'CAPTCHA: ' + cap };
        }
      } else {
        return { site: SITE, error: 'No departing flight cards found' };
      }
    }

    // The flight-card list lives under main > div.uitk-spacing-margin-blockend-four > ul.
    // Each <li> is one card. Same selector applies to both the departing and
    // returning result lists.
    const FLIGHT_LIST_LI = 'main div.uitk-spacing-margin-blockend-four > ul > li';
    const departingTexts = await page.locator(FLIGHT_LIST_LI).evaluateAll(els =>
      els.slice(0, 5).map(el => el.innerText.replace(/\s+/g, ' ').trim())
    ).catch(() => []);

    if (departingTexts.length === 0) {
      return { site: SITE, error: 'No "Recommended departing flights" cards found' };
    }

    console.log(`  [Expedia] Found ${departingTexts.length} recommended departing flight(s)`);
    console.log(`  [Expedia] DUMP card[0]: ${departingTexts[0]?.slice(0, 220)}...`);

    const results = [];
    const seen = new Set();

    for (let i = 0; i < departingTexts.length; i++) {
      const departingText = departingTexts[i];
      console.log(`  [Expedia] --- Card ${i} loop start ---`);
      const carrier = detectCarrier(departingText);
      if (!carrier) {
        console.log(`  [Expedia] Card ${i}: skipping (carrier not in WN/UA/DL/AA)`);
        continue;
      }
      const carrierConfig = SUPPORTED_CARRIERS[carrier.code];
      const departing = parseCard(departingText);
      if (!departing) {
        console.log(`  [Expedia] Card ${i}: parseCard returned null for ${carrier.name}`);
        continue;
      }
      console.log(`  [Expedia] Card ${i}: parsed ${carrier.name} ${departing.timeRange}`);

      // Reset to the search page each iteration — the modal-then-returning
      // flow pushes 1-2 history entries that goBack handles unreliably.
      if (i > 0) {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.locator('[class*="uitk-card"]').filter({ hasText: /Roundtrip per traveler/i })
          .first().waitFor({ timeout: 25_000 }).catch(() => {});
        await humanDelay(1000, 1500);
      }

      // Re-locate the i-th departing card by index in DOM order.
      const card = page.locator('main div.uitk-spacing-margin-blockend-four > ul > li').nth(i);
      await card.scrollIntoViewIfNeeded().catch(() => {});
      await humanDelay(500, 900);
      await card.click({ timeout: 10_000 }).catch(() => {});

      console.log(`  [Expedia] Card ${i}: clicked ${carrier.name} departing, waiting for modal`);
      const modal = await waitForFareModal(page);
      const modalCount = await modal.count().catch(() => 0);
      console.log(`  [Expedia] Card ${i}: modal locator count=${modalCount}`);

      const tierPicked = await selectFareTier(page, modal, carrierConfig);
      if (!tierPicked) {
        console.log(`  [Expedia] Card ${i}: tier selection failed for ${carrier.name}`);
        continue;
      }
      console.log(`  [Expedia] Card ${i}: tier selected, waiting for returning flights`);

      const returnTexts = await scrapeReturning(page);
      console.log(`  [Expedia] Card ${i}: got ${returnTexts.length} returning flight card(s)`);
      if (returnTexts.length === 0) continue;

      let added = 0;
      for (const rText of returnTexts) {
        if (added >= 2) break;
        const ret = parseCard(rText);
        if (!ret || !ret.price) continue;

        const retCarrier = detectCarrier(rText) || carrier;
        const dedupKey = `${carrier.name}:${departing.timeRange}:${retCarrier.name}:${ret.timeRange}:${ret.price}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        const baseRtPrice = ret.price;
        const outFees = bagFeesForTrip(carrier.name, params.travelers);
        const retFees = bagFeesForTrip(retCarrier.name, params.travelers);
        const baseGroup = baseRtPrice * params.travelers;
        const totalGroup = baseGroup + outFees.outbound + retFees.return;

        results.push({
          airline: carrier.name === retCarrier.name ? carrier.name : `${carrier.name} / ${retCarrier.name}`,
          outbound: departing.timeRange,
          return_: ret.timeRange,
          stopsOut: departing.stops,
          stopsRet: ret.stops,
          stops: `${departing.stops} / ${ret.stops}`,
          includes: inferFareIncludes(departingText + ' ' + rText, carrier.name),
          baseRtPrice,
          perPerson: '$' + baseRtPrice.toLocaleString('en-US') + ' RT',
          bagFees: `$${outFees.outbound} / $${retFees.return}`,
          total: '$' + totalGroup.toLocaleString('en-US'),
        });
        added++;
      }
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results parsed — modal/return flow may have changed' };
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
