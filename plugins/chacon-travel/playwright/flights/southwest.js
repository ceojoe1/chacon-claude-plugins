import { humanDelay, detectCaptcha, parsePrice, selectAutocomplete, inferFareIncludes, extractIATA } from '../sites/helpers.js';

const SITE = 'Southwest';
const URL = 'https://www.southwest.com';

// Formats a date as MM/DD/YYYY for Southwest's date fields
function toSWDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2000);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // Ensure "Round trip" is selected
    const roundTripOption = page.locator('[value="roundtrip"], label:has-text("Round trip")').first();
    if (await roundTripOption.isVisible({ timeout: 3000 }).catch(() => false)) {
      await roundTripOption.click();
      await humanDelay(300, 500);
    }

    // Pick airport autocomplete option scoped to a specific IATA code.
    // Southwest renders many [role="option"] on the page (trip-type dropdown,
    // recent searches, etc.) so we filter to airport rows of the form
    // "City, ST - IATA" and prefer the one matching our target code.
    const pickAirportOption = async (iataCode) => {
      if (iataCode) {
        const exact = page.locator('[role="option"]').filter({
          hasText: new RegExp(`-\\s*${iataCode}\\b`, 'i'),
        }).first();
        if (await exact.isVisible({ timeout: 3000 }).catch(() => false)) {
          await exact.click();
          return true;
        }
      }
      // Fallback: first visible option that looks like an airport row
      const anyAirport = page.locator('[role="option"]').filter({
        hasText: /,\s*[A-Z]{2}\s*-\s*[A-Z]{3}/,
      }).first();
      if (await anyAirport.isVisible({ timeout: 3000 }).catch(() => false)) {
        await anyAirport.click();
        return true;
      }
      return false;
    };

    // Set origin
    const originIATA = extractIATA(params.origin);
    const originField = page.locator('#originationAirportCode, [placeholder*="From"], [aria-label*="Depart"]').first();
    if (await originField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await originField.click();
      await humanDelay(200, 400);
      await page.keyboard.press('Control+a');
      await page.keyboard.type(params.origin, { delay: 80 });
      await humanDelay(800, 1100);
      await pickAirportOption(originIATA);
      await humanDelay(300, 500);
    }

    // Set destination
    const destIATA = extractIATA(params.destination);
    const destField = page.locator('#destinationAirportCode, [placeholder*="To"], [aria-label*="Arrive"]').first();
    await destField.click();
    await humanDelay(200, 400);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(800, 1100);
    await pickAirportOption(destIATA);
    await humanDelay(300, 500);

    // Set departure date — triple-click to select, then type MM/DD/YYYY
    const departField = page.locator('#departureDate, [placeholder*="Depart date"], [aria-label*="Depart date"]').first();
    await departField.click({ clickCount: 3 });
    await humanDelay(200, 300);
    await page.keyboard.type(toSWDate(params.depart), { delay: 60 });
    await humanDelay(300, 500);

    // Set return date
    const returnField = page.locator('#returnDate, [placeholder*="Return date"], [aria-label*="Return date"]').first();
    await returnField.click({ clickCount: 3 });
    await humanDelay(200, 300);
    await page.keyboard.type(toSWDate(params.return), { delay: 60 });
    await humanDelay(300, 500);

    // Set passenger count — type directly into the field
    const passField = page.locator('#adultPassengerCount, [aria-label*="Adult"], [name*="adult"]').first();
    if (await passField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await passField.click({ clickCount: 3 });
      await humanDelay(200, 300);
      await page.keyboard.type(String(params.travelers), { delay: 60 });
      await humanDelay(300, 500);
      // Close any picker that opened
      const applyBtn = page.locator('button:has-text("Apply"), button:has-text("Done")').first();
      if (await applyBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await applyBtn.click();
        await humanDelay(300, 500);
      }
    }

    // Submit search
    await page.locator('button[type="submit"], button:has-text("Search flights")').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    await humanDelay(2000, 3000);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + (_cap2 || _cap) };
    }

    // Extract results from body text. Southwest's results page uses CSS-module
    // class names (e.g. fareOptionsContainer__2RRWu) that hash on each deploy,
    // so DOM-based selectors are brittle. Body text is stable: each fare row
    // looks like:
    //   "# 1581 / 2386 ... Departs 5:10AM Arrives 9:30AM 1 stop ... DEN 5h 20m
    //    247 Dollars$247  287 Dollars$287  357 Dollars$357  402 Dollars$402"
    // Tier order: Basic, Choice, Choice Preferred, Choice Extra (one-way prices).
    const bodyText = await page.locator('body').textContent({ timeout: 5000 }).catch(() => '');
    const results = [];

    // Split into per-flight blocks on "# DDDD / DDDD" flight-number markers
    const blocks = bodyText.split(/(?=#\s*\d{2,4}\s*\/\s*\d{2,4})/).slice(1);

    for (const block of blocks) {
      const departMatch = block.match(/Departs\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      const arriveMatch = block.match(/Arrives\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
      const stopsMatch = block.match(/(Nonstop|\d+\s*stop)/i);
      const durMatch = block.match(/(\d+h\s*\d+m)/);
      // Extract tier prices. Southwest's body text concatenates the visible
      // and screen-reader price labels into a run like:
      //   "247 Dollars$247287 Dollars$287357 Dollars$357402 Dollars$402"
      // (Basic, Choice, Choice Preferred, Choice Extra). Splitting on "Dollars"
      // gives ["247 ", "$247287 ", "$287357 ", "$357402 ", "$402..."]. The
      // price for each tier is the last 2-4 digit run in each segment before
      // the "Dollars" delimiter (the tail digits of "$247287 " → "287").
      const priceMatches = [];
      const segments = block.split(/Dollars/i);
      for (let i = 0; i < segments.length - 1; i++) {
        const m = segments[i].match(/(\d{2,4})\s*$/);
        if (!m) continue;
        const p = parseFloat(m[1]);
        if (p >= 50 && p <= 1500) priceMatches.push(p);
      }

      if (!departMatch || !arriveMatch || priceMatches.length < 1) continue;

      const route = `${departMatch[1]} – ${arriveMatch[1]}` + (durMatch ? ` (${durMatch[1]})` : '');
      const stops = stopsMatch ? stopsMatch[1] : '—';

      // Emit one row per itinerary at the Basic tier (the cheapest fare).
      // Southwest's body text makes higher tiers unreliable to parse — but the
      // Includes column ("Carry-on, 2 bags (no seat)") already signals to the
      // user that an upgrade is needed for seat selection.
      const oneWay = Math.min(...priceMatches);
      const rtPP = oneWay * 2;
      const groupTotal = rtPP * params.travelers;
      results.push({
        airline: 'Southwest',
        route,
        stops,
        includes: inferFareIncludes('Go for Less Basic', 'Southwest'),
        perPerson: '$' + rtPP.toLocaleString('en-US') + ' RT',
        total: '$' + groupTotal.toLocaleString('en-US'),
      });

      // Cap at the 3 cheapest itineraries (Southwest's default sort)
      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results found — Southwest may have changed its UI' };
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
