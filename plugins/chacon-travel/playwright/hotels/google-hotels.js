import { humanDelay, detectCaptcha } from '../sites/helpers.js';

const SITE = 'Google Hotels';

function nightCount(depart, ret) {
  return Math.round((new Date(ret) - new Date(depart)) / (1000 * 60 * 60 * 24));
}

// Direct ?q= search URL — bypasses the homepage form entirely.
// Per debugging/hotels/google-hotels/google-hotels.md.
function buildUrl(params) {
  return `https://www.google.com/travel/search?q=${encodeURIComponent(params.destination)}&hl=en`;
}

async function search(context, params) {
  const page = await context.newPage();
  const nights = nightCount(params.depart, params.return);

  try {
    await page.goto(buildUrl(params), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(1500, 2500);

    const cap = await detectCaptcha(page);
    if (cap) return { site: SITE, error: 'CAPTCHA: ' + cap };

    // --- Set check-in / check-out via the calendar inputs ---
    // Google's [data-iso] cells silently swallow Playwright clicks (likely an
    // isTrusted check), but the visible inputs accept typed MM/DD/YYYY values
    // followed by Tab to commit. Focus instead of click — the calendar
    // popover's Material ripple intercepts pointer events headlessly.
    const toMDY = (iso) => {
      const [y, m, d] = iso.split('-');
      return `${m}/${d}/${y}`;
    };
    const typeDate = async (input, iso) => {
      await input.focus();
      await humanDelay(150, 300);
      await page.keyboard.press('Control+a');
      await page.keyboard.press('Delete');
      await page.keyboard.type(toMDY(iso), { delay: 40 });
      await page.keyboard.press('Tab');
      await humanDelay(400, 700);
    };

    const checkIn = page.locator('input[aria-label="Check-in"]').first();
    const checkOut = page.locator('input[aria-label="Check-out"]').first();
    if (await checkIn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await typeDate(checkIn, params.depart);
      await typeDate(checkOut, params.return);
    }

    // Close calendar if a Done button is showing.
    const doneBtn = page.locator('button').filter({ hasText: /^Done$/ }).last();
    if (await doneBtn.isVisible({ timeout: 800 }).catch(() => false)) {
      await doneBtn.click().catch(() => {});
      await humanDelay(400, 700);
    }

    // --- Set guests (Google defaults to 2) ---
    if (params.travelers !== 2) {
      const opened = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('[role="button"]'))
          .find(el => el.getAttribute('aria-label')?.toLowerCase().includes('traveler'));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (opened) {
        await humanDelay(500, 800);
        const delta = params.travelers - 2;
        const btnLabel = delta > 0 ? 'Add adult' : 'Remove adult';
        const adjustBtn = page.locator(`[aria-label="${btnLabel}"]`).first();
        if (await adjustBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
          for (let i = 0; i < Math.abs(delta); i++) {
            await adjustBtn.click();
            await humanDelay(150, 250);
          }
        }
        const pickerDone = page.locator('button').filter({ hasText: /^Done$/ }).last();
        if (await pickerDone.isVisible({ timeout: 1000 }).catch(() => false)) {
          await pickerDone.click();
          await humanDelay(400, 600);
        }
      }
    }

    // Click Search to apply dates + guest changes.
    const searchBtn = page.locator('[aria-label="Search"]').first();
    if (await searchBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await searchBtn.click({ force: true });
      await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
      await humanDelay(1500, 2500);
    }

    // --- Locate the hotel-card grid ---
    // Per the debug doc, the card list lives under main > c-wiz > span > c-wiz.
    // Each c-wiz[N] (typically 3..N) inside is one hotel card. We grab the
    // top 8 visible cards and iterate them.
    await page.locator('main c-wiz span c-wiz c-wiz').first()
      .waitFor({ timeout: 15_000 })
      .catch(() => {});
    await humanDelay(1000, 1500);

    // Filter c-wiz children to ones that look like real hotel cards AND
    // extract each card's detail-page link. Clicking the card via Playwright
    // is unreliable (Google's jsaction handlers ignore synthetic clicks); we
    // navigate directly via the card's <a href> instead.
    const hotelCardHandles = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('main c-wiz span c-wiz > c-wiz'));
      return all
        .map((el, idx) => {
          const text = el.innerText.replace(/\s+/g, ' ').trim();
          // Find the anchor that links to this hotel's detail page.
          const link = el.querySelector('a[href*="/travel/"]');
          const href = link ? link.href : null;
          return { idx, text, href };
        })
        .filter(({ text, href }) =>
          href
          && /\$\d{2,5}/.test(text)
          && !/^Sponsored\b/i.test(text)
          && !/results?$/i.test(text)
          && !/Prices in this area/i.test(text)
          && !/Hotels nearby/i.test(text)
        );
    }).catch(() => []);

    if (hotelCardHandles.length === 0) {
      return { site: SITE, error: 'No hotel cards passed filter (sponsored/info-only?)' };
    }
    const maxCards = Math.min(hotelCardHandles.length, 8);
    console.log(`  [Google Hotels] ${hotelCardHandles.length} qualifying hotel cards — drilling top ${maxCards}`);

    // Snapshot results-page URL so we can return after each detail navigation.
    const resultsUrl = page.url();

    const allRows = [];
    const seenHotels = new Set();

    for (let i = 0; i < maxCards; i++) {
      const { text: cardText, href } = hotelCardHandles[i];
      const flat = cardText.replace(/\s+/g, ' ').trim();
      const nameLine = flat.split(/[•·]/)[0].split('$')[0].trim();
      // Strip Google's promotional badges that bleed into the heading.
      const property = nameLine
        .replace(/\b(GREAT PRICE|GREAT DEAL|DEAL|GREAT VALUE)\b/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 80) || `Hotel ${i + 1}`;
      if (seenHotels.has(property.toLowerCase())) continue;
      seenHotels.add(property.toLowerCase());

      const ratingMatch = flat.match(/(\d\.\d)\s*\(/);
      const rating = ratingMatch ? `⭐${ratingMatch[1]}` : '—';

      // Navigate directly to the hotel's detail page via the card's <a href>.
      // Wait for networkidle so price-source XHRs finish, then for #prices
      // to render at least one $ value (not just the empty heading).
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 12_000 }).catch(() => {});
      await page.locator('#prices').first().waitFor({ timeout: 12_000 }).catch(() => {});
      // Wait for at least one price to actually appear inside #prices.
      await page.waitForFunction(() => {
        const p = document.querySelector('#prices');
        return p && /\$\d{2,5}/.test(p.innerText || '');
      }, { timeout: 10_000 }).catch(() => {});

      // Switch the price dropdown to "Stay total". The trigger button can
      // live above the #prices section (in the page header). Search the
      // whole document for a button whose text matches the per-night /
      // display-price affordance, or that has aria-haspopup="dialog".
      const switched = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        // Prefer literal text matches first — most stable.
        const trigger =
          buttons.find(b => /^(Per night|\$\s*per night)$/i.test(b.innerText.trim()))
          || buttons.find(b => /per night/i.test(b.innerText) && b.innerText.length < 30)
          || buttons.find(b => /^(Display|Sort|Filter)\s*by/i.test(b.innerText.trim()))
          || buttons.find(b => b.getAttribute('aria-haspopup') === 'dialog'
                                 && /night|total|price|display/i.test(b.innerText + (b.getAttribute('aria-label') || '')));
        if (!trigger) {
          // Last-ditch dump: list a few buttons so we can see what's there.
          const sample = buttons.slice(0, 30).map(b => ({
            text: b.innerText?.slice(0, 30).replace(/\s+/g, ' ').trim(),
            popup: b.getAttribute('aria-haspopup'),
            label: b.getAttribute('aria-label')?.slice(0, 40),
          })).filter(b => b.text);
          return { triggered: false, reason: 'no trigger button', sample };
        }
        trigger.scrollIntoView({ block: 'center' });
        trigger.click();
        return { triggered: true, label: trigger.innerText.slice(0, 50) };
      }).catch(() => ({ triggered: false, reason: 'eval error' }));

      console.log(`  [Google Hotels]   dropdown trigger: ${switched.triggered ? `"${switched.label}"` : `failed (${switched.reason})`}`);
      if (switched.triggered) {
        // Wait for the dialog/menu to actually become visible — the click
        // returns immediately but the popup animates in.
        await page.locator('[role="dialog"], [role="menu"]').first()
          .waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});

        const dialogOpts = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"], [role="menu"]');
          if (!dlg) return null;
          return Array.from(dlg.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="option"], button, label, span'))
            .map(el => el.innerText?.replace(/\s+/g, ' ').trim() || '')
            .filter(t => t && t.length < 60)
            .slice(0, 20);
        }).catch(() => null);
        console.log(`  [Google Hotels]   dialog options: ${JSON.stringify(dialogOpts)}`);

        const stayTotalOption = page.locator('[role="dialog"], [role="menu"]')
          .locator('text=/(Stay total|Total for \\d+ nights?|Total price)/i').first();
        const optVisible = await stayTotalOption.isVisible({ timeout: 3_000 }).catch(() => false);
        if (optVisible) {
          // Capture an existing price string so we can wait for it to change
          // after switching to Stay Total.
          const beforePrice = await page.evaluate(() => {
            const p = document.querySelector('#prices');
            const m = p?.innerText.match(/\$[\d,]+/);
            return m ? m[0] : null;
          }).catch(() => null);

          await stayTotalOption.click().catch(() => {});

          // Wait for price text inside #prices to change (Stay Total values
          // are higher than per-night, so the displayed string differs).
          await page.waitForFunction(prev => {
            const p = document.querySelector('#prices');
            const m = p?.innerText.match(/\$[\d,]+/);
            return m && m[0] !== prev;
          }, beforePrice, { timeout: 6_000 }).catch(() => {});
          await humanDelay(500, 800);
          console.log(`  [Google Hotels]   Stay total switched (${beforePrice} → updated)`);
        } else {
          console.log(`  [Google Hotels]   Stay total option NOT FOUND in dialog`);
        }
      }

      // Scrape the price-option list. Per the debug doc:
      //   #prices > c-wiz.K1smNd > c-wiz.tuyxUe > div > section > div.A5WLXb > c-wiz > div
      // Fall back to a more permissive selector if the strict path doesn't match.
      const optionTexts = await page.evaluate(() => {
        const tryPaths = [
          '#prices c-wiz.K1smNd c-wiz.tuyxUe section div.A5WLXb c-wiz > div',
          '#prices c-wiz section c-wiz > div',
          '#prices section c-wiz',
          '#prices section',
          '#prices',
        ];
        let container = null;
        for (const sel of tryPaths) {
          container = document.querySelector(sel);
          if (container) break;
        }
        if (!container) return [];
        // Cast a wider net — any descendant with a price + provider text.
        return Array.from(container.querySelectorAll('div, a, li'))
          .map(el => el.innerText?.replace(/\s+/g, ' ').trim() || '')
          .filter(t => /\$\d{2,5}/.test(t) && t.length < 300 && !/sponsored/i.test(t));
      }).catch(() => []);

      console.log(`  [Google Hotels] ${property}: found ${optionTexts.length} price option(s)`);

      // Parse each option. With Stay Total enabled the captured number is
      // the total for the whole stay; per-night = total / nights.
      const KNOWN_SOURCES = [
        'Booking.com', 'Expedia', 'Hotels.com', 'Agoda', 'Priceline',
        'Trip.com', 'Trivago', 'Super.com', 'Orbitz', 'Hotwire',
        'Travelocity', 'Vio.com', 'Snaptravel', 'Kayak', 'Google Hotels',
      ];
      const options = [];
      for (const text of optionTexts) {
        const priceMatch = text.match(/\$([\d,]+)/);
        if (!priceMatch) continue;
        const total = parseFloat(priceMatch[1].replace(/,/g, ''));
        // Plausible-range filter: a 4-night stay total above $80 and below
        // $20k. Single-night per-night prices below ~$80 will be rejected.
        if (!total || total < 80 || total > 20_000) continue;
        const matchedSource = KNOWN_SOURCES.find(s =>
          text.toLowerCase().includes(s.toLowerCase())
        );
        const source = matchedSource || text.slice(0, 30).split('$')[0].trim() || 'Google Hotels';
        options.push({ source, total });
      }

      // Take the 3 cheapest unique price points for this hotel.
      const sorted = options.sort((a, b) => a.total - b.total);
      const top3 = [];
      const seenPrices = new Set();
      for (const opt of sorted) {
        if (seenPrices.has(opt.total)) continue;
        seenPrices.add(opt.total);
        top3.push(opt);
        if (top3.length >= 3) break;
      }

      for (const opt of top3) {
        const perNightNum = opt.total / nights;
        allRows.push({
          property,
          type: 'Hotel',
          rating,
          perNight: '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
          total: '$' + opt.total.toLocaleString('en-US', { maximumFractionDigits: 0 }),
          notes: `${nights} nights via ${opt.source}`,
        });
      }

      // Navigate back to the results list for the next hotel. Going to the
      // snapshot URL is more reliable than page.goBack() on Google's SPA.
      if (i < maxCards - 1) {
        await page.goto(resultsUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
        await page.locator('main c-wiz span c-wiz > c-wiz').first()
          .waitFor({ timeout: 10_000 }).catch(() => {});
        await humanDelay(700, 1100);
      }
    }

    if (allRows.length === 0) {
      return { site: SITE, error: 'No price options scraped from any hotel modal' };
    }
    return { site: SITE, results: allRows };

  } catch (err) {
    return { site: SITE, error: err.message };
  } finally {
    await page.close();
  }
}

search.siteName = SITE;
export default search;
