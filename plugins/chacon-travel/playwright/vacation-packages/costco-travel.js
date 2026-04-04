import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../sites/helpers.js';

const SITE = 'Costco Travel';
const URL = 'https://www.costcotravel.com/Vacation-Packages';

async function search(context, params) {
  const page = await context.newPage();
  try {
    const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    const finalUrl = page.url();
    if (
      response?.status() === 403 ||
      finalUrl.includes('blocked') ||
      finalUrl.includes('login') ||
      finalUrl.includes('error')
    ) {
      return { site: SITE, error: 'Access blocked — use --headed mode or search manually' };
    }

    await humanDelay(1000, 1500);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    const bodyText = await page.textContent('body', { timeout: 5000 }).catch(() => '');
    if (!bodyText || bodyText.length < 200 || bodyText.toLowerCase().includes('access denied')) {
      return { site: SITE, error: 'Access blocked — Costco Travel restricts automated access' };
    }

    // Set origin
    const originField = page.locator('[placeholder*="Departing from"], [aria-label*="Departing from"]').first();
    if (!await originField.isVisible({ timeout: 3000 }).catch(() => false)) {
      return { site: SITE, error: 'Page did not load — access may be blocked' };
    }

    await originField.click();
    await humanDelay(300, 500);
    await page.keyboard.type(params.origin, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set destination
    const destField = page.locator('[placeholder*="Going to"], [aria-label*="Going to"]').first();
    await destField.click();
    await humanDelay(300, 500);
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set dates
    const departField = page.locator('[aria-label*="Departing"], [placeholder*="Depart"]').first();
    if (await departField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await departField.click();
      await humanDelay(500, 800);
      await selectCalendarDate(page, params.depart);
      await humanDelay(300, 500);
      await selectCalendarDate(page, params.return);
      await humanDelay(300, 500);
    }

    // Set travelers
    const travelersField = page.locator('[aria-label*="Travelers"], [placeholder*="Travelers"]').first();
    if (await travelersField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await travelersField.click();
      await humanDelay(300, 500);
      const addAdult = page.locator('[aria-label*="Add adult"], [aria-label*="Increase"]').first();
      if (await addAdult.isVisible({ timeout: 1500 }).catch(() => false)) {
        for (let i = 1; i < params.travelers; i++) {
          await addAdult.click();
          await humanDelay(200, 400);
        }
      }
    }

    // Search
    await page.locator('button[type="submit"], button:has-text("Search")').first().click();
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(2000, 3000);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + (_cap2 || _cap) };
    }

    // Extract results
    const results = [];

    const cards = await page.locator('[class*="package-card"], [class*="result-item"], [class*="hotel-result"]')
      .filter({ hasText: '$' })
      .all();

    for (const card of cards.slice(0, 2)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      const priceMatch = cardText.match(/\$[\d,]+/);
      if (!priceMatch) continue;

      const ppNum = parseFloat(priceMatch[0].replace(/[^0-9.]/g, ''));
      const groupNum = ppNum * params.travelers;

      const nameMatch = cardText.match(/^([^\n$]{5,80})/);
      const packageName = nameMatch ? nameMatch[1].trim() : 'Costco Travel Package';

      // Costco gift card perks
      const perksMatch = cardText.match(/\$[\d,]+ (?:Costco Cash|gift card|credit)/i);
      const notes = perksMatch ? perksMatch[0] : '';

      results.push({
        packageName: packageName + (notes ? ` + ${notes}` : ''),
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
