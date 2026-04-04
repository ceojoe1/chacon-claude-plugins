import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../../../../playwright/sites/helpers.js';

const SITE = 'Kayak';
const URL = 'https://www.kayak.com/packages';

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2500);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // Set origin
    const originField = page.locator('[aria-label*="origin"], [placeholder*="From"], .origin input').first();
    await originField.click();
    await humanDelay(300, 500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.origin, { delay: 90 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set destination
    const destField = page.locator('[aria-label*="destination"], [placeholder*="To"], .destination input').first();
    await destField.click();
    await humanDelay(300, 500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 90 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set dates
    const departField = page.locator('[aria-label*="Depart"], .depart-date input, [placeholder*="Depart"]').first();
    if (await departField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await departField.click();
      await humanDelay(500, 800);
      await selectCalendarDate(page, params.depart);
      await humanDelay(400, 600);
      await selectCalendarDate(page, params.return);
      await humanDelay(400, 600);
    }

    // Set travelers
    const addAdult = page.locator('[aria-label*="Add adult"], [aria-label*="Increase adults"]').first();
    if (await addAdult.isVisible({ timeout: 2000 }).catch(() => false)) {
      for (let i = 1; i < params.travelers; i++) {
        await addAdult.click();
        await humanDelay(200, 400);
      }
    }

    // Search
    await page.locator('button[type="submit"], button:has-text("Search"), .search-btn').first().click();
    await humanDelay(3000, 4000);
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(1500, 2500);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + (_cap2 || _cap) };
    }

    // May redirect to a partner site (Priceline, etc.)
    const results = [];

    const cards = await page.locator('[class*="resultInner"], [data-resultid], [class*="package"]')
      .filter({ hasText: '$' })
      .all();

    for (const card of cards.slice(0, 2)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      const priceMatches = [...cardText.matchAll(/\$[\d,]+/g)].map(m =>
        parseFloat(m[0].replace(/[^0-9.]/g, ''))
      ).filter(n => n > 0).sort((a, b) => a - b);

      if (!priceMatches.length) continue;

      const ppNum = priceMatches[0];
      const groupNum = ppNum * params.travelers;

      const nameMatch = cardText.match(/^([^\n$]{5,80})/);
      const packageName = nameMatch ? nameMatch[1].trim() : 'Kayak Package';

      results.push({
        packageName,
        flightCost: 'Bundled',
        hotelCost: 'Bundled',
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
