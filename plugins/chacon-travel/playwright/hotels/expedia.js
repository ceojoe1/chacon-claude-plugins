import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../../../../playwright/sites/helpers.js';

const SITE = 'Expedia';
const URL = 'https://www.expedia.com/Hotels';

function nightCount(depart, ret) {
  return Math.round((new Date(ret) - new Date(depart)) / (1000 * 60 * 60 * 24));
}

async function search(context, params) {
  const page = await context.newPage();
  const nights = nightCount(params.depart, params.return);

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1000, 1500);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // Set destination
    const destField = page.locator('[aria-label*="Going to"], [placeholder*="Going to"], #hotel-destination').first();
    await destField.click();
    await humanDelay(300, 500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set dates
    const checkInField = page.locator('[aria-label*="Check-in"], #hotel-checkin').first();
    if (await checkInField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkInField.click();
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

    // Extract results
    const results = [];

    const cards = await page.locator('[data-test-id*="property-listing"], [class*="uitk-card"]')
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
      const property = nameMatch ? nameMatch[1].trim() : 'See Expedia';

      const ratingMatch = cardText.match(/(\d\.\d)\s*\/\s*10|(\d\.\d)\s*out of 10/);
      const rating = ratingMatch
        ? `⭐${ratingMatch[1] || ratingMatch[2]} / 10`
        : (cardText.match(/(\d\.\d)\s*\/\s*5/) ? `⭐${cardText.match(/(\d\.\d)\s*\/\s*5/)[1]} / 5` : '—');

      const cancelMatch = cardText.match(/free cancel/i);

      results.push({
        property,
        type: 'Hotel',
        rating,
        perNight: '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        total: '$' + totalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' (incl. taxes & fees)',
        notes: cancelMatch ? 'Free cancellation' : '',
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
