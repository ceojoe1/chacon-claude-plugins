import { humanDelay, detectCaptcha, parsePrice, selectAutocomplete } from '../sites/helpers.js';

const SITE = 'Google Hotels';
const URL = 'https://www.google.com/travel/hotels';

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

    // --- Set destination ---
    // Clicking the search field on the homepage, typing, and selecting autocomplete
    // auto-navigates to the hotel results page for that destination.
    const searchField = page.locator('[aria-label="Search for places, hotels and more"]').first();
    await searchField.click({ timeout: 5000 });
    await humanDelay(400, 600);
    await page.keyboard.press('Control+a');
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(800, 1200);
    await selectAutocomplete(page);
    // Wait for page to navigate to hotel results
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await humanDelay(1500, 2000);
    console.log(`      [GH] after destination: ${page.url().substring(0, 120)}`);

    // --- Set dates by typing into the Check-in / Check-out inputs ---
    // The [data-iso] calendar cells carry a Google jsaction "clickonly" handler
    // that silently ignores Playwright/JS-dispatched clicks (likely an
    // isTrusted/coordinate check in Google's event delegate). Real coordinate
    // clicks work, but they're brittle in headless. The inputs themselves are
    // not readOnly and accept MM/DD/YYYY typed values + Tab to commit.
    const toMDY = (iso) => {
      const [y, m, d] = iso.split('-');
      return `${m}/${d}/${y}`;
    };

    const checkInInput = page.locator('input[aria-label="Check-in"]').first();
    const checkOutInput = page.locator('input[aria-label="Check-out"]').first();

    const checkInVisible = await checkInInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`      [GH] check-in input visible: ${checkInVisible}`);
    if (!checkInVisible) {
      return { site: SITE, error: 'Check-in input not found' };
    }

    // Focus the field, select all existing text via keyboard, then type. We
    // avoid .click() because the calendar popover's Material ripple overlay
    // intercepts pointer events headlessly. .focus() works without any click.
    const typeDate = async (input, iso, label) => {
      await input.focus();
      await humanDelay(200, 400);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.keyboard.type(toMDY(iso), { delay: 50 });
      await page.keyboard.press('Tab');
      await humanDelay(600, 900);
      const v = await input.inputValue({ timeout: 1000 }).catch(() => '');
      console.log(`      [GH] ${label} field reads: "${v}"`);
      return v;
    };

    await typeDate(checkInInput, params.depart, 'check-in');
    await typeDate(checkOutInput, params.return, 'check-out');

    // Close calendar if Done is visible (Tab usually closes it, but be safe).
    const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).last();
    if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await doneBtn.click();
      await humanDelay(600, 900);
    }

    // --- Set guests ---
    // Google Hotels defaults to 2 adults, so adjust either direction.
    if (params.travelers !== 2) {
      const opened = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('[role="button"]'))
          .find(el => el.getAttribute('aria-label')?.toLowerCase().includes('traveler'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      console.log(`      [GH] travelers picker opened: ${opened}`);
      if (opened) {
        await humanDelay(600, 900);
        const delta = params.travelers - 2;
        const btnLabel = delta > 0 ? 'Add adult' : 'Remove adult';
        const adjustBtn = page.locator(`[aria-label="${btnLabel}"]`).first();
        if (await adjustBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          for (let i = 0; i < Math.abs(delta); i++) {
            await adjustBtn.click();
            await humanDelay(200, 300);
          }
        }
        await humanDelay(400, 600);
        const pickerDone = page.locator('button').filter({ hasText: /^Done$/ }).last();
        if (await pickerDone.isVisible({ timeout: 1000 }).catch(() => false)) {
          await pickerDone.click();
          await humanDelay(400, 600);
        }
      }
    }

    // --- Click Search to apply the updated dates/guests ---
    const searchBtn = page.locator('[aria-label="Search"]').first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click({ force: true });
      await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
      await humanDelay(2000, 3000);
    }

    console.log(`      [GH] results URL: ${page.url().substring(0, 150)}`);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap2 };
    }

    // --- Extract results ---
    // Wait for hotel cards to render
    await page.waitForFunction(() => {
      const body = document.body.innerText;
      return body.includes('per night') || body.includes('/night') || body.includes('$');
    }, { timeout: 10_000 }).catch(() => null);

    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    console.log(`      [GH] body snippet: ${bodyText.replace(/\s+/g, ' ').substring(0, 400)}`);

    // Find price elements (per night format on Google Hotels)
    const priceEls = await page.locator('*').filter({ hasText: /^\$[\d,]{2,6}$/ }).all();
    console.log(`      [GH] price elements: ${priceEls.length}`);

    const results = [];
    const seen = new Set();

    for (const el of priceEls.slice(0, 40)) {
      const cardInfo = await el.evaluate(e => {
        let p = e;
        for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
          const text = p.innerText?.trim();
          if (text && text.length > 30 && text.length < 1000) return text.replace(/\s+/g, ' ');
        }
        return null;
      }).catch(() => null);

      if (!cardInfo) continue;
      const key = cardInfo.substring(0, 50);
      if (seen.has(key)) continue;
      seen.add(key);

      const priceMatch = cardInfo.match(/\$[\d,]+/);
      if (!priceMatch) continue;
      const perNightNum = parseFloat(priceMatch[0].replace(/[^0-9.]/g, ''));
      if (!perNightNum || perNightNum < 30 || perNightNum > 10000) continue;

      console.log(`      [GH card] ${cardInfo.substring(0, 200)}`);

      const totalNum = perNightNum * nights;
      const nameMatch = cardInfo.match(/^([^$\n]{5,60})/);
      const property = nameMatch ? nameMatch[1].trim() : 'Google Hotels Property';

      const ratingMatch = cardInfo.match(/(\d\.\d)\s*(?:\/\s*5|out of)/);
      const rating = ratingMatch ? `⭐${ratingMatch[1]}` : '—';

      if (results.some(r => r.perNight === '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }))) continue;

      results.push({
        property,
        type: 'Hotel',
        rating,
        perNight: '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        total: '~$' + totalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        notes: `${nights} nights`,
      });
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
