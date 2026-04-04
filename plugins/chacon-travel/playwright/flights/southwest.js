import { humanDelay, detectCaptcha, parsePrice, selectAutocomplete } from '../../../../playwright/sites/helpers.js';

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

    // Set origin
    const originField = page.locator('#originationAirportCode, [placeholder*="From"], [aria-label*="Depart"]').first();
    if (await originField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await originField.click();
      await humanDelay(200, 400);
      await page.keyboard.press('Control+a');
      await page.keyboard.type(params.origin, { delay: 80 });
      await humanDelay(600, 900);
      await selectAutocomplete(page).catch(() => {});
      await humanDelay(300, 500);
    }

    // Set destination
    const destField = page.locator('#destinationAirportCode, [placeholder*="To"], [aria-label*="Arrive"]').first();
    await destField.click();
    await humanDelay(200, 400);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(600, 900);
    await page.locator('[role="option"]').first().click({ timeout: 5000 }).catch(() => {});
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

    // Extract results
    // Southwest shows prices per person one-way — multiply by 2 × travelers for RT group total
    const results = [];

    // Look for fare cards with price info
    const fareCards = await page.locator('[class*="card"], [class*="flight-result"], [data-qa*="flight"]')
      .filter({ hasText: '$' })
      .all();

    for (const card of fareCards.slice(0, 2)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      // Price shown per person one-way — find all prices and take the smallest
      // that falls in a realistic one-way range ($50–$800), avoiding fee totals
      const allPrices = [...cardText.matchAll(/\$(\d[\d,]*)/g)]
        .map(m => parseFloat(m[1].replace(/,/g, '')))
        .filter(p => p >= 50 && p <= 800);
      if (allPrices.length === 0) continue;

      const oneWayPP = Math.min(...allPrices);
      const rtPP = oneWayPP * 2;
      const groupTotal = rtPP * params.travelers;

      const pp = '$' + rtPP.toLocaleString('en-US', { maximumFractionDigits: 0 });
      const total = '$' + groupTotal.toLocaleString('en-US', { maximumFractionDigits: 0 });

      // Extract stop info
      const stopsMatch = cardText.match(/Nonstop|\d+ stop/i);
      const stops = stopsMatch ? stopsMatch[0] : '—';

      results.push({
        airline: 'Southwest',
        route: `${params.depart} → ${params.return}`,
        stops,
        perPerson: pp + ' RT',
        total,
      });

      break; // Take the cheapest (Wanna Get Away) fare only
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
