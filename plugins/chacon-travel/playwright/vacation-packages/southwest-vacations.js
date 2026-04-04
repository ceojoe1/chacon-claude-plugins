import { humanDelay, detectCaptcha, selectAutocomplete } from '../sites/helpers.js';

const SITE = 'Southwest Vacations';
const URL = 'https://www.southwest.com/vacations/';

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2000);

    const _cap = await detectCaptcha(page); if (_cap) {
      return { site: SITE, error: 'CAPTCHA: ' + _cap };
    }

    // --- Set destination ---
    // Find and click the To combobox, clear it, type MCO
    await page.waitForSelector('[placeholder="__/__"]', { timeout: 5000 }).catch(() => null);
    const toField = page.getByRole('combobox', { name: /^To$/i }).first();
    await toField.click({ timeout: 5000 });
    await humanDelay(500, 700);
    // Select all and type - use fill() for React controlled input
    await toField.fill('MCO');
    await humanDelay(800, 1200);
    const firstOption = page.locator('[role="option"]').first();
    if (await firstOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstOption.click();
    } else {
      await page.keyboard.press('ArrowDown');
      await humanDelay(150, 250);
      await page.keyboard.press('Enter');
    }
    await humanDelay(600, 900);
    const toVal = await toField.inputValue().catch(() => '?');
    console.log(`      [SW] To = "${toVal}"`);

    // --- Set dates via React native setter ---
    // The date inputs have inputmode="none" so we set values via React's native setter
    const departMMDD = params.depart.substring(5).replace('-', '/'); // "2026-07-10" → "07/10"
    const returnMMDD = params.return.substring(5).replace('-', '/');
    const datesSet = await page.evaluate(({ dep, ret }) => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const depart = document.getElementById('departureDate');
      const returnEl = document.getElementById('returnDate');
      if (!depart || !returnEl) return false;
      setter.call(depart, dep);
      depart.dispatchEvent(new Event('input', { bubbles: true }));
      depart.dispatchEvent(new Event('change', { bubbles: true }));
      setter.call(returnEl, ret);
      returnEl.dispatchEvent(new Event('input', { bubbles: true }));
      returnEl.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { dep: departMMDD, ret: returnMMDD });
    console.log(`      [SW] dates set via JS: ${datesSet}`);
    await humanDelay(600, 900);

    // Verify date values
    const departVal0 = await page.locator('#departureDate').inputValue().catch(() => '?');
    const returnVal0 = await page.locator('#returnDate').inputValue().catch(() => '?');
    console.log(`      [SW] after JS set: depart="${departVal0}" return="${returnVal0}"`);

    // The form requires calendar-confirmed dates (React state).
    // JS setter updates DOM value which also navigates the calendar to the right month.
    // Now click the date field and click the day numbers to confirm via calendar.
    const departInput = page.locator('#departureDate').first();
    await departInput.click();
    await humanDelay(800, 1200);

    // Calendar should now show target month (JS setter navigated it). Click the days.
    const departSet = await clickCalendarDaySW(page, params.depart);
    console.log(`      [SW] depart confirmed: ${departSet}`);
    await humanDelay(400, 600);

    // Return: calendar may auto-advance or need opening
    const calOpen = await page.locator('[class*="days__"]').isVisible({ timeout: 500 }).catch(() => false);
    if (!calOpen) {
      await page.locator('#returnDate').first().click();
      await humanDelay(600, 900);
    }
    const returnSet = await clickCalendarDaySW(page, params.return);
    console.log(`      [SW] return confirmed: ${returnSet}`);
    await humanDelay(400, 600);
    await page.keyboard.press('Escape');
    await humanDelay(500, 700);

    const departVal = await departInput.inputValue().catch(() => '?');
    const returnVal = await page.locator('#returnDate').first().inputValue().catch(() => '?');
    console.log(`      [SW] final: depart="${departVal}" return="${returnVal}"`);

    // --- Set travelers ---
    // Default is "1 Room, 2 Travelers" on SW Vacations
    if (params.travelers > 2) {
      // Click the travelers button to open picker
      const travelersBtn = page.locator('button').filter({ hasText: /Travelers?/i }).first();
      const travelersBtnVisible = await travelersBtn.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`      [SW] travelers btn visible: ${travelersBtnVisible}`);
      if (travelersBtnVisible) {
        await travelersBtn.click();
        await humanDelay(600, 900);


        const added = await page.evaluate((travelers) => {
          // Look for the Adults stepper — try multiple strategies
          // Strategy 1: find leaf "Adults" text
          const adultsLabel = Array.from(document.querySelectorAll('*')).find(el =>
            el.children.length === 0 && el.textContent.trim() === 'Adults'
          );
          if (adultsLabel) {
            let p = adultsLabel.parentElement;
            for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
              const btns = Array.from(p.querySelectorAll('button'));
              const plusBtn = btns.find(b => b.textContent.trim() === '+' || b.getAttribute('aria-label')?.includes('Add') || b.getAttribute('aria-label')?.includes('increase'));
              if (plusBtn) {
                const toAdd = travelers - 2; // default is 2
                for (let j = 0; j < toAdd; j++) {
                  plusBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
                }
                return toAdd;
              }
            }
          }
          // Strategy 2: look for any visible + button near a number stepper
          const allBtns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
          const plusBtns = allBtns.filter(b => b.textContent.trim() === '+');
          if (plusBtns.length > 0) {
            const toAdd = travelers - 2;
            for (let j = 0; j < toAdd; j++) {
              plusBtns[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            }
            return toAdd;
          }
          return -1;
        }, params.travelers);
        console.log(`      [SW] adults added: ${added}`);
        await humanDelay(400, 600);

        await page.evaluate(() => {
          const apply = Array.from(document.querySelectorAll('button')).find(b => /^apply$/i.test(b.textContent.trim()));
          if (apply) apply.click();
        });
        await humanDelay(500, 700);
      }
    }
    console.log(`      [SW] travelers param: ${params.travelers}`);

    // --- Search ---
    // Set up new-tab listener BEFORE clicking to avoid race condition
    const newTabPromise = context.waitForEvent('page', { timeout: 18_000 }).catch(() => null);
    await page.locator('button:has-text("Find a vacation")').first().click({ timeout: 10_000 });
    await humanDelay(1500, 2500);

    const newTab = await newTabPromise;
    const resultsPage = newTab || page;
    await resultsPage.waitForLoadState('networkidle', { timeout: 30_000 }).catch(() => {});
    await humanDelay(2500, 3500);
    console.log(`      [SW] Results URL: ${resultsPage.url().substring(0, 120)}`);

    const _cap2 = await detectCaptcha(resultsPage);
    if (_cap2) return { site: SITE, error: 'CAPTCHA: ' + _cap2 };

    // Check if we're on the results page (vs homepage featured deals)
    const isResultsPage = resultsPage.url().includes('vacations.southwest.com');
    console.log(`      [SW] isResultsPage: ${isResultsPage}`);

    const results = [];

    if (isResultsPage) {
      // Results page: LI cards with "holiday price is $X.XX" — prices are totals for all guests
      // Scroll to load more hotel cards
      for (let s = 0; s < 3; s++) {
        await resultsPage.evaluate(() => window.scrollBy(0, 1200)).catch(() => {});
        await humanDelay(700, 1000);
      }

      const hotelCards = await resultsPage.evaluate(() => {
        const lis = Array.from(document.querySelectorAll('li'));
        return lis
          .filter(li => li.innerText?.includes('holiday price') && li.innerText?.length > 80)
          .map(li => li.innerText?.replace(/\s+/g, ' ').trim())
          .filter(Boolean);
      }).catch(() => []);
      console.log(`      [SW] hotel cards found: ${hotelCards.length}`);

      for (const card of hotelCards) {
        console.log(`      [SW hotel] ${card.substring(0, 200)}`);
        const priceMatch = card.match(/holiday price is \$([\d,]+\.?\d*)/i);
        if (!priceMatch) continue;
        const totalRaw = parseFloat(priceMatch[1].replace(/,/g, ''));
        if (!totalRaw || totalRaw < 500 || totalRaw > 200000) continue;

        // Extract hotel name: "Holiday N of N HOTEL_NAME N.N stars"
        const hotelMatch = card.match(/Holiday \d+ of \d+\s+(.+?)\s+(\d+(?:\.\d+)?)\s*stars?/i);
        const hotelName = hotelMatch ? hotelMatch[1].trim() : 'SW Vacation Package';
        const stars = hotelMatch ? hotelMatch[2] : '';

        const perPersonRaw = Math.round(totalRaw / params.travelers);
        const pp = '$' + perPersonRaw.toLocaleString('en-US');
        const total = '$' + Math.round(totalRaw).toLocaleString('en-US');

        const packageName = hotelName + (stars ? ` (${stars}★)` : '');
        if (results.some(r => r.total === total)) continue;
        results.push({ packageName, flightCost: 'Bundled', hotelCost: 'Bundled', perPerson: pp, total });
        if (results.length >= 3) break;
      }

      // Fallback: if no LI cards parsed, try the old price-element approach with total→perPerson division
      if (results.length === 0) {
        const priceEls = await resultsPage.locator('*').filter({ hasText: /^\$[\d,]+(\.\d{2})?$/ }).all();
        const seen = new Set();
        for (const el of priceEls.slice(0, 30)) {
          const cardInfo = await el.evaluate(e => {
            let p = e;
            for (let i = 0; i < 10 && p; i++, p = p.parentElement) {
              const text = p.innerText?.trim();
              if (text && text.includes('holiday price') && text.length > 50 && text.length < 3000)
                return text.replace(/\s+/g, ' ');
            }
            return null;
          }).catch(() => null);
          if (!cardInfo) continue;
          const key = cardInfo.substring(0, 60);
          if (seen.has(key)) continue;
          seen.add(key);
          const pm = cardInfo.match(/holiday price is \$([\d,]+\.?\d*)/i);
          if (!pm) continue;
          const totalRaw = parseFloat(pm[1].replace(/,/g, ''));
          if (!totalRaw || totalRaw < 500) continue;
          const perPersonRaw = Math.round(totalRaw / params.travelers);
          results.push({
            packageName: 'SW Vacation Package',
            flightCost: 'Bundled', hotelCost: 'Bundled',
            perPerson: '$' + perPersonRaw.toLocaleString('en-US'),
            total: '$' + Math.round(totalRaw).toLocaleString('en-US')
          });
          if (results.length >= 3) break;
        }
      }
    } else {
      // Homepage featured deals (no real search results) — skip
      console.log(`      [SW] on homepage, not results page — no real results`);
    }

    if (newTab) await newTab.close().catch(() => {});
    if (results.length === 0) return { site: SITE, error: 'No results found' };
    return { site: SITE, results };

  } catch (err) {
    return { site: SITE, error: err.message };
  } finally {
    await page.close().catch(() => {});
  }
}

async function clickCalendarDaySW(page, isoDate) {
  const target = new Date(isoDate + 'T12:00:00');
  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const targetMonth = monthNames[target.getMonth()];
  const targetMonthShort = targetMonth.substring(0, 3); // "Jul"
  const targetYear = String(target.getFullYear());
  const targetDay = target.getDate();

  for (let attempt = 0; attempt < 18; attempt++) {
    // Dump calendar header text for debugging
    const calText = await page.evaluate(() => {
      const cal = document.querySelector('[class*="calendar__"]') ||
                  document.querySelector('[class*="Calendar"]') ||
                  document.querySelector('[class*="datePicker"]');
      return cal ? cal.innerText?.substring(0, 200) : null;
    }).catch(() => null);
    console.log(`      [SW cal attempt=${attempt}] header: ${calText?.replace(/\s+/g, ' ')?.substring(0, 100)}`);

    // Check for the target month — accept both full ("July") and abbreviated ("Jul")
    const pageText = await page.evaluate(() => document.body.innerText).catch(() => '');
    const visible = pageText.includes(targetMonth + ' ' + targetYear) ||
                    pageText.includes(targetMonthShort + ' ' + targetYear) ||
                    pageText.includes(targetMonth + '\n' + targetYear);

    if (visible) {
      // Find the right days__ container for this month
      const clicked = await page.evaluate(({ month, monthShort, year, day }) => {
        const yearNum = parseInt(year);
        // Get all days containers
        const containers = Array.from(document.querySelectorAll('[class*="days__"]'));
        for (const container of containers) {
          // Check this container's context includes the right month/year
          let p = container;
          let foundMonth = false;
          for (let i = 0; i < 15 && p; i++, p = p.parentElement) {
            const txt = p.textContent || '';
            if ((txt.includes(month + ' ' + year) || txt.includes(monthShort + ' ' + year)) &&
                txt.includes(year)) {
              foundMonth = true; break;
            }
          }
          if (!foundMonth) continue;

          const fireClick = (el) => {
            ['mousedown','mouseup','click'].forEach(type => {
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            });
          };
          // Click the right day — search all descendants, not just direct children
          const allEls = Array.from(container.querySelectorAll('*'));
          for (const el of allEls) {
            const txt = el.textContent.trim();
            if (txt === String(day) && el.children.length === 0) {
              fireClick(el);
              return { found: true, tag: el.tagName, text: txt };
            }
          }
          // Fallback: direct children
          const children = Array.from(container.children);
          for (const child of children) {
            if (child.textContent.trim() === String(day)) {
              fireClick(child);
              return { found: true, tag: child.tagName, text: child.textContent.trim() };
            }
          }
        }
        return { found: false, containers: containers.length };
      }, { month: targetMonth, monthShort: targetMonthShort, year: targetYear, day: targetDay });

      console.log(`      [SW cal] click result: ${JSON.stringify(clicked)}`);
      if (clicked?.found) { await humanDelay(300, 500); return true; }
    }

    // Advance calendar — use evaluate() to bypass pointer event interception from overlapping inputs
    const advanced = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button[class*="passMouseEventsThrough"]'));
      if (btns.length === 0) return false;
      // Last button is the rightmost (next month)
      btns[btns.length - 1].click();
      return true;
    });
    if (!advanced) break;
    await humanDelay(500, 700);
  }
  return false;
}

search.siteName = SITE;
export default search;
