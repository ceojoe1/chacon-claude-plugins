import { humanDelay, detectCaptcha, selectAutocomplete, inferFareIncludes } from '../sites/helpers.js';

const SITE = 'Google Flights';
const URL = 'https://www.google.com/travel/flights';

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2000);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // --- Set passenger count ---
    if (params.travelers > 1) {
      await page.waitForSelector('[aria-label*="passenger"]', { timeout: 5000 }).catch(() => null);
      const passengerBtn = page.locator('[aria-label*="passenger"]').first();
      await passengerBtn.click({ timeout: 5000 }).catch(() => null);
      await humanDelay(600, 900);

      const addAdultBtn = page.locator('[aria-label="Add adult"]');
      await addAdultBtn.waitFor({ state: 'visible', timeout: 3000 }).catch(() => null);
      for (let i = 1; i < params.travelers; i++) {
        await addAdultBtn.click();
        await humanDelay(250, 400);
      }

      const doneBtn = page.locator('[aria-label="Done"]').first();
      if (await doneBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await doneBtn.click();
      } else {
        await page.locator('button').filter({ hasText: /^Done$/ }).first().click({ timeout: 2000 }).catch(() => null);
      }
      await humanDelay(500, 700);
    }

    // --- Set origin ---
    // Clicking "Where from?" opens a dialog; after autocomplete, Tab moves focus to "Where to?"
    if (params.origin) {
      const originField = page.locator('[aria-label="Where from?"]').first();
      await originField.click();
      await humanDelay(500, 700);
      // Clear existing text and type origin
      await page.keyboard.press('Control+a');
      await humanDelay(150, 250);
      await page.keyboard.type(params.origin, { delay: 80 });
      await selectAutocomplete(page);
      await humanDelay(600, 900);
      // Press Escape to close any remaining dialog overlay
      await page.keyboard.press('Escape');
      await humanDelay(400, 600);
    }

    // --- Set destination ---
    // Wait for destination field to be clickable; fall back to Tab+type if not
    const destField = page.locator('[placeholder="Where to?"]').first();
    const destVisible = await destField.isVisible({ timeout: 3000 }).catch(() => false);
    if (destVisible) {
      await destField.click();
    } else {
      // Tab from origin field into the "Where to?" field
      await page.keyboard.press('Tab');
    }
    await humanDelay(400, 600);
    await page.keyboard.type(params.destination, { delay: 80 });
    await selectAutocomplete(page);
    await humanDelay(600, 900);

    // --- Set dates via calendar ---
    // Google Flights calendar day cells use [data-iso="YYYY-MM-DD"].
    // Navigation: [aria-label="Next"] button.

    const departField = page.locator('[aria-label="Departure"]').first();
    await departField.click();
    await humanDelay(800, 1200);

    const clickCalendarDate = async (isoDate) => {
      for (let attempt = 0; attempt < 15; attempt++) {
        const dayEl = page.locator(`[data-iso="${isoDate}"]`).first();
        if (await dayEl.isVisible({ timeout: 600 }).catch(() => false)) {
          await dayEl.click();
          await humanDelay(400, 600);
          return true;
        }
        const nextBtn = page.locator('[aria-label="Next"]').first();
        if (!await nextBtn.isVisible({ timeout: 1000 }).catch(() => false)) break;
        await nextBtn.click();
        await humanDelay(500, 700);
      }
      return false;
    };

    const departSet = await clickCalendarDate(params.depart);
    console.log(`      [GF] depart set: ${departSet}`);
    const returnSet = await clickCalendarDate(params.return);
    console.log(`      [GF] return set: ${returnSet}`);

    // Click Done to close calendar
    const calDoneBtn = page.locator('button').filter({ hasText: /^Done$/ }).last();
    if (await calDoneBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await calDoneBtn.click();
      await humanDelay(400, 600);
    }

    // --- Search ---
    const searchBtn = page.locator('[aria-label="Search"]').first();
    await searchBtn.click({ force: true, timeout: 10_000 });
    const navigated = await page.waitForURL(/travel\/flights\/search/, { timeout: 15_000 }).then(() => true).catch(() => false);
    if (!navigated) {
      await page.keyboard.press('Enter');
      await page.waitForURL(/travel\/flights\/search/, { timeout: 15_000 }).catch(() => null);
    }
    await page.waitForLoadState('networkidle', { timeout: 20_000 });
    // Extra wait for JS-rendered flight results
    await humanDelay(3000, 4000);
    console.log(`      [GF] URL: ${page.url().substring(0, 150)}`);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap2 };
    }

    // --- Verify traveler count from results page ---
    const passengerLabel = await page.locator('[aria-label*="change number of passengers"]').first()
      .getAttribute('aria-label', { timeout: 2000 }).catch(() => '');
    const confirmedTravelers = parseInt(passengerLabel?.match(/^(\d+)\s+passenger/)?.[1] || '0');
    if (confirmedTravelers > 0 && confirmedTravelers !== params.travelers) {
      return { site: SITE, error: `Traveler count mismatch: searched ${params.travelers} but page shows ${confirmedTravelers}` };
    }

    // --- Wait for results to render ---
    // Google Flights results render async after networkidle — wait for a price to appear
    await page.waitForFunction(() => {
      const body = document.body.innerText || '';
      return body.includes('Nonstop') || body.includes('1 stop') || body.includes('nonstop');
    }, { timeout: 15_000 }).catch(() => null);

    // --- Extract results ---
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');

    // Find price elements — match $XXX or $X,XXX format (leaf nodes with just a price)
    const priceEls = await page.locator('*').filter({ hasText: /^\$[\d,]{2,7}$/ }).all();
    console.log(`      [GF] price elements found: ${priceEls.length}`);

    const results = [];

    // Collect unique card texts by walking up from each price element
    const seenCards = new Set();
    for (const el of priceEls) {
      const cardInfo = await el.evaluate(e => {
        let p = e;
        for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
          if (p.innerText?.match(/\d{1,2}:\d{2}\s*[AP]M/i)) {
            return p.innerText?.replace(/\s+/g, ' ').trim();
          }
        }
        return null;
      }).catch(() => null);

      if (!cardInfo || seenCards.has(cardInfo)) continue;
      seenCards.add(cardInfo);
      if (!/\d{1,2}:\d{2}\s*[AP]M/i.test(cardInfo)) continue;

      console.log(`      [GF card] ${JSON.stringify(cardInfo.substring(0, 300))}`);

      // Card format: "H:MM AM – H:MM PM[+1] AIRLINE X hr Y min ROUTE N stop ..."
      // Airline comes AFTER the time range
      const airlineMatch = cardInfo.match(
        /\d{1,2}:\d{2}\s*[AP]M\s*[–\-]\s*\d{1,2}:\d{2}\s*[AP]M(?:\+\d+)?\s+([A-Za-z][A-Za-z\s,&·]+?)(?=\s+\d+\s+hr)/i
      );
      const airline = airlineMatch ? airlineMatch[1].trim().replace(/[,·\s]+$/, '') : 'Unknown';

      const priceMatch = cardInfo.match(/\$[\d,]+/);
      const priceRaw = priceMatch ? parseFloat(priceMatch[0].replace(/[^0-9]/g, '')) : null;
      if (!priceRaw || priceRaw < 50 || priceRaw > 20000) continue;

      // Google Flights shows total price for all travelers when N>1
      const perPersonRaw = params.travelers > 1 ? Math.round(priceRaw / params.travelers) : priceRaw;
      const totalRaw = params.travelers > 1 ? priceRaw : priceRaw * params.travelers;

      const pp = '$' + perPersonRaw.toLocaleString('en-US') + ' RT';
      const total = '$' + totalRaw.toLocaleString('en-US');

      const stopsMatch = cardInfo.match(/Nonstop|[0-3] stop/i);
      const stops = stopsMatch ? stopsMatch[0] : '—';

      const timesMatch = cardInfo.match(/(\d{1,2}:\d{2}\s*[AP]M\s*[–\-]\s*\d{1,2}:\d{2}\s*[AP]M)/i);
      const route = timesMatch ? timesMatch[1].trim() : '—';

      if (results.some(r => r.perPerson === pp && r.stops === stops)) continue;

      const includes = inferFareIncludes(cardInfo, airline);
      results.push({ airline, route, stops, includes, perPerson: pp, total });
      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results found' };
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
