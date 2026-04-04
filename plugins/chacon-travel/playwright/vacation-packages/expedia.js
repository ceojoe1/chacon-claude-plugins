import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../../../../playwright/sites/helpers.js';

const SITE = 'Expedia';
const URL = 'https://www.expedia.com/Vacation-Packages';

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1000, 1500);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // Set origin
    const originField = page.locator('[aria-label*="Leaving from"], [placeholder*="Leaving from"]').first();
    await originField.click();
    await humanDelay(300, 500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.origin, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set destination
    const destField = page.locator('[aria-label*="Going to"], [placeholder*="Going to"]').first();
    await destField.click();
    await humanDelay(300, 500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set dates
    const dateField = page.locator('[aria-label*="Departing"], [placeholder*="Depart"]').first();
    if (await dateField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dateField.click();
      await humanDelay(500, 800);
      await selectCalendarDate(page, params.depart);
      await humanDelay(300, 500);
      await selectCalendarDate(page, params.return);
      await humanDelay(300, 500);
      const doneBtn = page.locator('button:has-text("Done")').first();
      if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await doneBtn.click();
        await humanDelay(300, 500);
      }
    }

    // Set travelers
    const travelersBtn = page.locator('[aria-label*="Traveler"], button:has-text("Travelers")').first();
    if (await travelersBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await travelersBtn.click();
      await humanDelay(400, 600);
      const addAdult = page.locator('[aria-label*="Increase adults"], [aria-label*="Add adult"]').first();
      if (await addAdult.isVisible({ timeout: 2000 }).catch(() => false)) {
        for (let i = 1; i < params.travelers; i++) {
          await addAdult.click();
          await humanDelay(200, 400);
        }
      }
      const doneBtn = page.locator('button:has-text("Done")').first();
      if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await doneBtn.click();
        await humanDelay(300, 500);
      }
    }

    // Search
    await page.locator('button[type="submit"], button:has-text("Search"), [aria-label*="Search"]').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(2000, 3000);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + (_cap2 || _cap) };
    }

    // Extract results — Expedia packages show per-person or combined total
    const results = [];

    const cards = await page.locator('[data-test-id*="listing"], [class*="uitk-card"]')
      .filter({ hasText: '$' })
      .all();

    for (const card of cards.slice(0, 2)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      // Find all prices — largest is likely the total, smallest may be per person
      const priceMatches = [...cardText.matchAll(/\$[\d,]+/g)].map(m =>
        parseFloat(m[0].replace(/[^0-9.]/g, ''))
      ).filter(n => n > 0).sort((a, b) => a - b);

      if (!priceMatches.length) continue;

      // Heuristic: if smallest price × travelers ≈ largest price, it's per-person
      const smallest = priceMatches[0];
      const largest = priceMatches[priceMatches.length - 1];
      let ppNum, groupNum;

      if (largest > smallest * params.travelers * 0.8 && largest < smallest * params.travelers * 1.3) {
        ppNum = smallest;
        groupNum = largest;
      } else {
        // Assume per person
        ppNum = smallest;
        groupNum = smallest * params.travelers;
      }

      const nameMatch = cardText.match(/^([^\n$]{5,80})/);
      const packageName = nameMatch ? nameMatch[1].trim() : 'Expedia Package';

      // Check for savings callout
      const saveMatch = cardText.match(/[Ss]ave \$[\d,]+/);
      const notes = saveMatch ? saveMatch[0] : '';

      // Try to split flight/hotel costs
      const flightMatch = cardText.match(/[Ff]light[s]?[:\s]*\$?([\d,]+)/);
      const hotelMatch = cardText.match(/[Hh]otel[s]?[:\s]*\$?([\d,]+)/);

      results.push({
        packageName: packageName + (notes ? ` (${notes})` : ''),
        flightCost: flightMatch ? '$' + flightMatch[1] : 'Bundled',
        hotelCost: hotelMatch ? '$' + hotelMatch[1] : 'Bundled',
        perPerson: '$' + ppNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        total: '$' + groupNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
      });
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
