import { humanDelay, detectCaptcha } from '../sites/helpers.js';

const SITE = 'Kayak';
const URL = 'https://www.kayak.com/hotels';

function nightCount(depart, ret) {
  return Math.round((new Date(ret) - new Date(depart)) / (1000 * 60 * 60 * 24));
}

async function search(context, params) {
  const page = await context.newPage();
  const nights = nightCount(params.depart, params.return);

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2500);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // --- Set destination ---
    // Destination trigger is a div[tabindex="0"] — clicking reveals text input
    const destTrigger = page.locator('div[tabindex="0"]').first();
    await destTrigger.click({ timeout: 5000 });
    await humanDelay(400, 600);

    const destInput = page.locator('input[placeholder*="city, hotel"]').first();
    const destInputVisible = await destInput.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`      [KH] dest input visible: ${destInputVisible}`);

    if (destInputVisible) {
      await destInput.fill(params.destination);
    } else {
      await page.keyboard.type(params.destination, { delay: 80 });
    }
    await humanDelay(800, 1200);

    // Select first autocomplete option
    const firstOpt = page.locator('[role="option"]').first();
    if (await firstOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstOpt.click();
    } else {
      await page.keyboard.press('ArrowDown');
      await humanDelay(150, 250);
      await page.keyboard.press('Enter');
    }
    await humanDelay(600, 900);
    console.log(`      [KH] destination selected`);

    // --- Open calendar ---
    const startDateBtn = page.locator('[aria-label*="Select start date from calendar input"]').first();
    const startDateVisible = await startDateBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`      [KH] start date btn visible: ${startDateVisible}`);
    if (startDateVisible) {
      await startDateBtn.click();
      await humanDelay(1000, 1500);
    }

    const clickKayakDate = async (isoDate) => {
      const d = new Date(isoDate + 'T12:00:00');
      const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); // "July 2026"
      const dayLabel = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }); // "July 10, 2026"

      console.log(`      [KH] targeting date: ${dayLabel}`);

      // Navigate forward month by month using "Next Month" button until target month is visible
      // Fresh context calendar: paginated (2 months shown), not scrollable
      for (let attempt = 0; attempt < 20; attempt++) {
        const captions = await page.evaluate(() =>
          Array.from(document.querySelectorAll('caption.w0lb-month-name')).map(c => c.textContent.trim())
        );
        console.log(`      [KH cal attempt=${attempt}] captions: ${JSON.stringify(captions)}`);

        if (captions.includes(monthYear)) {
          // Month is visible — find and click the day cell
          const clicked = await page.evaluate((dayLabel) => {
            const dayEl = Array.from(document.querySelectorAll('div[aria-label]'))
              .find(el => el.getAttribute('aria-label').startsWith(dayLabel));
            if (!dayEl) return null;
            ['mouseenter', 'mouseover', 'mousedown', 'mouseup', 'click'].forEach(type => {
              dayEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            });
            return dayEl.getAttribute('aria-label');
          }, dayLabel);

          console.log(`      [KH] day click result: ${clicked}`);
          if (clicked) {
            await humanDelay(400, 600);
            return true;
          }
        }

        // Click "Next Month" button to advance calendar
        const advanced = await page.evaluate(() => {
          const btn = document.querySelector('[aria-label="Next Month"]');
          if (btn) { btn.click(); return true; }
          return false;
        });
        console.log(`      [KH] next month clicked: ${advanced}`);
        if (!advanced) break;
        await humanDelay(500, 700);
      }
      return false;
    };

    const departSet = await clickKayakDate(params.depart);
    console.log(`      [KH] depart set: ${departSet}`);

    // After first date click, calendar may still be open for return date
    await humanDelay(400, 600);
    const returnSet = await clickKayakDate(params.return);
    console.log(`      [KH] return set: ${returnSet}`);

    // Confirm date selection (if a confirm button exists)
    const confirmBtn = page.locator('button, [role="button"]').filter({ hasText: /Select these dates/i }).first();
    const confirmVisible = await confirmBtn.isVisible({ timeout: 1500 }).catch(() => false);
    console.log(`      [KH] confirm btn visible: ${confirmVisible}`);
    if (confirmVisible) {
      await confirmBtn.click();
      console.log(`      [KH] dates confirmed`);
      await humanDelay(600, 900);
    } else {
      // Calendar auto-closes after both dates selected — press Escape to close if still open
      const calStillOpen = await page.locator('.OV9e').isVisible({ timeout: 500 }).catch(() => false);
      if (calStillOpen) {
        await page.keyboard.press('Escape');
        await humanDelay(400, 600);
      }
    }

    // --- Set guests ---
    if (params.travelers > 1) {
      const guestsBtn = page.locator('button').filter({ hasText: /guests?/i }).first();
      const guestsBtnVisible = await guestsBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`      [KH] guests btn visible: ${guestsBtnVisible}`);
      if (guestsBtnVisible) {
        await guestsBtn.click();
        await humanDelay(500, 700);

        // Add adults (default is 1, add travelers-1 more)
        const addAdultBtn = page.locator('[aria-label*="Increase adult"], [aria-label*="Add adult"]').first();
        if (await addAdultBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          for (let i = 1; i < params.travelers; i++) {
            await addAdultBtn.click();
            await humanDelay(200, 300);
          }
        }

        // Close picker
        const doneBtn = page.locator('button').filter({ hasText: /^Done$/i }).first();
        if (await doneBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
          await doneBtn.click();
          await humanDelay(400, 600);
        }
      }
    }

    // --- Search ---
    // Try multiple selectors for the Search button
    // Set up new tab listener in case results open in a new tab
    const newTabPromise = context.waitForEvent('page', { timeout: 20_000 }).catch(() => null);

    const searchBtn = page.locator('button[aria-label="Search"], button:has-text("Search")').first();
    const searchBtnVisible = await searchBtn.isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`      [KH] search btn visible: ${searchBtnVisible}`);
    if (searchBtnVisible) {
      await searchBtn.click({ force: true });
    } else {
      await page.keyboard.press('Enter');
    }

    // Wait for either this page to navigate or a new tab to open
    const newTab = await Promise.race([
      newTabPromise,
      page.waitForNavigation({ timeout: 15_000, waitUntil: 'domcontentloaded' }).catch(() => null).then(() => null)
    ]).catch(() => null);

    const resultsPage = newTab || page;
    await resultsPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(2500, 3500);
    console.log(`      [KH] results URL: ${resultsPage.url().substring(0, 150)}`);
    console.log(`      [KH] is new tab: ${!!newTab}`);

    const _cap2 = await detectCaptcha(resultsPage); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap2 };
    }

    // --- Extract results ---
    const results = [];
    const seen = new Set();

    const priceEls = await resultsPage.locator('*').filter({ hasText: /^\$[\d,]{2,6}$/ }).all();
    console.log(`      [KH] price elements: ${priceEls.length}`);

    for (const el of priceEls.slice(0, 40)) {
      const cardInfo = await el.evaluate(e => {
        let p = e;
        for (let i = 0; i < 10 && p; i++, p = p.parentElement) {
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

      console.log(`      [KH card] ${cardInfo.substring(0, 200)}`);

      const totalNum = perNightNum * nights;
      const nameMatch = cardInfo.match(/^([^$\n]{5,60})/);
      const property = nameMatch ? nameMatch[1].trim() : 'Kayak Hotel';

      const ratingMatch = cardInfo.match(/(\d\.\d)\s*\/?\s*10/);
      const rating = ratingMatch ? `⭐${ratingMatch[1]}/10` : '—';

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
    await page.close().catch(() => {});
  }
}

search.siteName = SITE;
export default search;
