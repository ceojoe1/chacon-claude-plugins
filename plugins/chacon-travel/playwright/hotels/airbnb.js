import { humanDelay, detectCaptcha, selectCalendarDate, selectAutocomplete } from '../../../../playwright/sites/helpers.js';

const SITE = 'Airbnb';
const URL = 'https://www.airbnb.com';

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

    // Dismiss "Now you'll see one price" popup if present
    await page.evaluate(() => {
      const gotIt = Array.from(document.querySelectorAll('button')).find(b =>
        b.textContent.trim() === 'Got it'
      );
      if (gotIt) gotIt.click();
    });
    await humanDelay(400, 600);

    // --- Set destination ---
    // Use page.evaluate() to avoid modal-container pointer event interception
    const destClicked = await page.evaluate(() => {
      const field = document.querySelector('[data-testid="structured-search-input-field-query"]') ||
                    document.querySelector('[placeholder="Search destinations"]');
      if (field) { field.focus(); field.click(); return true; }
      return false;
    });
    console.log(`      [AB] dest field clicked via evaluate: ${destClicked}`);
    await humanDelay(400, 600);
    await page.keyboard.type(params.destination, { delay: 80 });
    await humanDelay(800, 1200);

    // Select first autocomplete result
    const firstOpt = page.locator('[role="option"]').first();
    if (await firstOpt.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstOpt.click();
    } else {
      await page.keyboard.press('ArrowDown');
      await humanDelay(150, 250);
      await page.keyboard.press('Enter');
    }
    await humanDelay(600, 900);
    console.log(`      [AB] after dest selection, URL: ${page.url().substring(0, 100)}`);

    // --- Set dates ---
    // After destination selection Airbnb opens the "When" panel automatically.
    // Calendar cells use aria-label="Month Day, Year" (e.g. "July 10, 2026").
    // --- Open calendar tab ---
    // After destination selection, click the "Dates" calendar tab to get specific-date picker
    await page.locator('[data-testid="expanded-searchbar-dates-calendar-tab"]').first()
      .click({ timeout: 5000 }).catch(() => null);
    await humanDelay(600, 900);

    // Airbnb date button aria-label: "10, Friday, July 2026. Available. Select as check-in date."
    const clickAirbnbDate = async (isoDate) => {
      const d = new Date(isoDate + 'T12:00:00');
      const dayPrefix = `${d.getDate()},`;        // "10,"
      const monthYear = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); // "July 2026"

      for (let attempt = 0; attempt < 8; attempt++) {
        const clicked = await page.evaluate(({ dayPrefix, monthYear }) => {
          const btns = Array.from(document.querySelectorAll('button[aria-label]'));
          const btn = btns.find(b => {
            const lbl = b.getAttribute('aria-label') || '';
            return lbl.startsWith(dayPrefix) && lbl.includes(monthYear);
          });
          if (btn) { btn.click(); return btn.getAttribute('aria-label').substring(0, 40); }
          return null;
        }, { dayPrefix, monthYear });

        if (clicked) { await humanDelay(300, 500); return clicked; }

        // Navigate forward one month
        const advanced = await page.evaluate(() => {
          const btn = document.querySelector('[aria-label="Move forward to switch to the next month."]');
          if (btn) { btn.click(); return true; }
          return false;
        });
        if (!advanced) break;
        await humanDelay(600, 900);
      }
      return null;
    };

    const departSet = await clickAirbnbDate(params.depart);
    console.log(`      [AB] depart set: ${departSet}`);
    const returnSet = await clickAirbnbDate(params.return);
    console.log(`      [AB] return set: ${returnSet}`);
    await humanDelay(400, 600);

    // --- Set guests ---
    // Click "Who / Add guests" button (role="button" containing "Add guests")
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('[role="button"]'))
        .find(el => el.textContent.includes('Add guests'));
      if (btn) btn.click();
    });
    await humanDelay(500, 700);

    // Default is 0 adults — click increase travelers times
    const addAdult = page.locator('[data-testid="stepper-adults-increase-button"]').first();
    if (await addAdult.isVisible({ timeout: 2000 }).catch(() => false)) {
      for (let i = 0; i < params.travelers; i++) {
        await addAdult.click();
        await humanDelay(200, 300);
      }
      console.log(`      [AB] guests set to ${params.travelers}`);
    }

    // --- Search ---
    await page.locator('[data-testid="structured-search-input-search-button"]').first()
      .click({ timeout: 8000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(2000, 3000);
    console.log(`      [AB] results URL: ${page.url().substring(0, 150)}`);

    const _cap2 = await detectCaptcha(page); if (_cap2) {
      return { site: SITE, error: 'CAPTCHA: ' + (_cap2 || _cap) };
    }

    // Extract results — use [data-testid="listing-card-title"] to get clean property names
    // and walk up to find the price in the same card
    const results = [];
    const seenProps = new Set();

    const titleEls = await page.locator('[data-testid="listing-card-title"]').all();
    console.log(`      [AB] listing titles: ${titleEls.length}`);

    for (const titleEl of titleEls.slice(0, 10)) {
      const rawTitle = await titleEl.textContent().catch(() => '');
      // Walk up to find the card container with price
      const cardData = await titleEl.evaluate(el => {
        let p = el;
        for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
          const text = p.innerText?.trim();
          if (text && text.includes('$') && text.length > 20 && text.length < 1500) {
            return text.replace(/\s+/g, ' ');
          }
        }
        return null;
      }).catch(() => null);

      if (!cardData) continue;
      const prop = rawTitle.trim().replace(/^(Top guest favorite|Guest favorite)\s*/i, '');
      if (!prop || seenProps.has(prop)) continue;
      seenProps.add(prop);

      const priceMatch = cardData.match(/\$([\d,]+)\s*(?:night|\/night)?/i);
      if (!priceMatch) continue;
      const perNightNum = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (!perNightNum || perNightNum < 20 || perNightNum > 5000) continue;

      const estTotalNum = Math.round(perNightNum * nights * 1.2);
      const ratingMatch = cardData.match(/(\d\.\d{1,2})\s*(?:\([\d,]+\))?/);
      const rating = ratingMatch ? `⭐${ratingMatch[1]}` : '—';
      const bedsMatch = cardData.match(/(\d+)\s*(?:bed|BR|bedroom)/i);
      const typeMatch = cardData.match(/(?:entire\s+)?(?:home|condo|apartment|house|cabin|villa|room)/i);
      const type = typeMatch ? typeMatch[0].trim() : 'Rental';
      const favMatch = cardData.match(/Guest favorite/i);

      const noteParts = [];
      if (bedsMatch) noteParts.push(`${bedsMatch[1]}BR`);
      if (favMatch) noteParts.push('Guest favorite');

      results.push({
        property: prop,
        type: type.charAt(0).toUpperCase() + type.slice(1).toLowerCase(),
        rating,
        perNight: '~$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        total: '~$' + estTotalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' (est. w/ fees)',
        notes: noteParts.join(', ') || `${nights} nights`,
      });
      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results found — Airbnb may require login' };
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
