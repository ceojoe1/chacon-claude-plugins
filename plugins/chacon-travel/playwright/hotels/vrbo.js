import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../sites/helpers.js';

const SITE = 'VRBO';
const URL = 'https://www.vrbo.com';

function nightCount(depart, ret) {
  return Math.round((new Date(ret) - new Date(depart)) / (1000 * 60 * 60 * 24));
}

async function search(context, params) {
  const page = await context.newPage();
  const nights = nightCount(params.depart, params.return);

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2000);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // Set destination
    const destField = page.locator('[id*="destination"], [placeholder*="Where"], [aria-label*="destination"]').first();
    await destField.click();
    await humanDelay(300, 500);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(700, 1000);
    await selectAutocomplete(page);
    await humanDelay(400, 600);

    // Set check-in date
    const checkInField = page.locator('[id*="startDate"], [aria-label*="Check-in"], [placeholder*="Check-in"]').first();
    if (await checkInField.isVisible({ timeout: 3000 }).catch(() => false)) {
      await checkInField.click();
      await humanDelay(500, 800);
      await selectCalendarDate(page, params.depart);
      await humanDelay(400, 600);
      await selectCalendarDate(page, params.return);
      await humanDelay(300, 500);
    }

    // Set guests
    const guestsField = page.locator('[id*="guests"], [aria-label*="guests"], [placeholder*="guests"]').first();
    if (await guestsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await guestsField.click();
      await humanDelay(300, 500);

      // Try typing count directly
      await page.keyboard.press('Control+a');
      await page.keyboard.type(String(params.travelers), { delay: 60 });
      await humanDelay(300, 500);

      // Or use + button
      const addGuest = page.locator('[aria-label*="Add guest"], [aria-label*="Increase guests"]').first();
      if (await addGuest.isVisible({ timeout: 1500 }).catch(() => false)) {
        for (let i = 1; i < params.travelers; i++) {
          await addGuest.click();
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

    // Extract results — VRBO shows entire-home vacation rentals
    const results = [];

    const cards = await page.locator('[data-stid*="lodging-card"], [class*="PropertyCard"], [data-testid*="property"]')
      .filter({ hasText: '$' })
      .all();

    for (const card of cards.slice(0, 2)) {
      const cardText = await card.textContent().catch(() => '');
      if (!cardText) continue;

      // VRBO may show nightly or total price — try to detect
      const priceMatches = [...cardText.matchAll(/\$[\d,]+/g)].map(m => m[0]);
      if (!priceMatches.length) continue;

      // Use the largest price as total (VRBO often shows both nightly and total)
      const prices = priceMatches.map(p => parseFloat(p.replace(/[^0-9.]/g, '')));
      const maxPrice = Math.max(...prices);
      const minPrice = Math.min(...prices);

      // Assume largest number is total, smallest is nightly
      const totalNum = maxPrice > minPrice * nights * 0.8 ? maxPrice : minPrice * nights;
      const perNightNum = Math.round(totalNum / nights);

      const nameMatch = cardText.match(/^([^\n$]{5,80})/);
      const property = nameMatch ? nameMatch[1].trim() : 'VRBO Rental';

      const ratingMatch = cardText.match(/(\d\.\d)\s*\/\s*(?:5|10)|(\d+)\s*reviews?/i);
      const rating = ratingMatch ? `⭐${ratingMatch[1] || ratingMatch[2]}` : '—';

      const cancelMatch = cardText.match(/free cancel/i);
      const bedsMatch = cardText.match(/(\d+)\s*(?:bed|BR|bedroom)/i);
      const sleepsMatch = cardText.match(/sleeps\s*(\d+)/i);

      const noteParts = [];
      if (bedsMatch) noteParts.push(`${bedsMatch[1]}BR`);
      if (sleepsMatch) noteParts.push(`Sleeps ${sleepsMatch[1]}`);
      if (cancelMatch) noteParts.push('free cancellation');

      results.push({
        property,
        type: 'Condo',
        rating,
        perNight: '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        total: '$' + totalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' (all fees incl.)',
        notes: noteParts.join(', '),
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
