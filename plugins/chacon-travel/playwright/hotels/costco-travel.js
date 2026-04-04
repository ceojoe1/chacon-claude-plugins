import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../sites/helpers.js';

const SITE = 'Costco Travel';
const URL = 'https://www.costcotravel.com/Hotels';

function nightCount(depart, ret) {
  return Math.round((new Date(ret) - new Date(depart)) / (1000 * 60 * 60 * 24));
}

async function search(context, params) {
  const page = await context.newPage();
  const nights = nightCount(params.depart, params.return);

  try {
    const response = await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Costco Travel blocks headless/extension access — check for block page
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

    // Check if page loaded with usable content
    const bodyText = await page.textContent('body', { timeout: 5000 }).catch(() => '');
    if (!bodyText || bodyText.length < 200 || bodyText.toLowerCase().includes('access denied')) {
      return { site: SITE, error: 'Access blocked — Costco Travel restricts automated access' };
    }

    // Set destination
    const destField = page.locator('[placeholder*="destination"], [aria-label*="Destination"], #hotelSearch').first();
    if (!await destField.isVisible({ timeout: 3000 }).catch(() => false)) {
      return { site: SITE, error: 'Page did not load correctly — access may be blocked' };
    }

    await destField.click();
    await humanDelay(300, 500);
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set check-in date
    const checkInField = page.locator('[placeholder*="Check-in"], [aria-label*="Check in"]').first();
    if (await checkInField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkInField.click();
      await humanDelay(500, 800);
      await selectCalendarDate(page, params.depart);
      await humanDelay(300, 500);
      await selectCalendarDate(page, params.return);
      await humanDelay(300, 500);
    }

    // Set rooms/guests
    const roomsField = page.locator('[aria-label*="Rooms"], select[name*="room"]').first();
    if (await roomsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await roomsField.selectOption(String(params.rooms));
      await humanDelay(200, 400);
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

    const cards = await page.locator('[class*="hotel-card"], [class*="result-item"], [class*="property"]')
      .filter({ hasText: '$' })
      .all();

    for (const card of cards.slice(0, 2)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      const priceMatch = cardText.match(/\$[\d,]+/);
      if (!priceMatch) continue;

      const perNightNum = parseFloat(priceMatch[0].replace(/[^0-9.]/g, ''));
      const totalNum = perNightNum * nights;

      const nameMatch = cardText.match(/^([^\n$]{5,80})/);
      const property = nameMatch ? nameMatch[1].trim() : 'See Costco Travel';

      const ratingMatch = cardText.match(/(\d\.\d)\s*\/\s*5/);
      const rating = ratingMatch ? `⭐${ratingMatch[1]} / 5` : '—';

      // Costco often includes gift card perks
      const perksMatch = cardText.match(/\$[\d,]+ (?:Costco Cash|gift card|credit)/i);
      const notes = perksMatch ? perksMatch[0] : '';

      results.push({
        property,
        type: 'Hotel',
        rating,
        perNight: '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        total: '~$' + totalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        notes,
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
