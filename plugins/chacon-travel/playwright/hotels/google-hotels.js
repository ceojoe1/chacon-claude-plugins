import { humanDelay, detectCaptcha } from '../sites/helpers.js';
import { geocode, haversineMiles } from '../lib/distance.js';

const SITE = 'Google Hotels';

// Pull a city/region hint from the search query for hotel geocoding.
// "747 Howard Street, San Francisco, CA 94103" → "San Francisco, CA"
function cityHint(destination) {
  const parts = destination.split(',').map(s => s.trim());
  if (parts.length >= 2) return parts.slice(-2).join(', ').replace(/\s*\d{5}.*$/, '').trim();
  return destination;
}

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
          // Skip vacation rentals and apartments — they use a different DOM
          // for prices (no triple-dollar pattern) and burn drilldown budget.
          && !/\b(vacation rental|apartment|condo|house|villa|cabin|cottage|guesthouse|bungalow)\b/i.test(text)
        );
    }).catch(() => []);

    if (hotelCardHandles.length === 0) {
      return { site: SITE, error: 'No hotel cards passed filter (sponsored/info-only?)' };
    }
    const maxCards = Math.min(hotelCardHandles.length, params.maxHotels || 8);
    console.log(`  [Google Hotels] ${hotelCardHandles.length} qualifying hotel cards — drilling top ${maxCards}`);

    // Snapshot results-page URL so we can return after each detail navigation.
    const resultsUrl = page.url();

    const allRows = [];
    const seenHotels = new Set();

    // Geocoding origin: prefer an explicit landmark/experience anchor if the
    // skill provided one (e.g. "Islands of Adventure"), otherwise fall back
    // to the destination string. Anchors give meaningful distances when the
    // destination is fuzzy ("Orlando, FL near Islands of Adventure" doesn't
    // geocode but "Islands of Adventure" does).
    const anchorQuery = params.anchor || params.destination;
    const originCoord = await geocode(anchorQuery);
    const hint = cityHint(params.destination);
    console.log(`  [Google Hotels]   origin geocoded (${params.anchor ? 'anchor' : 'destination'}: "${anchorQuery}"): ${originCoord ? `${originCoord.lat.toFixed(4)},${originCoord.lon.toFixed(4)}` : 'failed'} | city hint: "${hint}"`);

    // Per-hotel budget: SERP load (~10s) + N hotels × ~25s each. Cap so we
    // exit cleanly before the search.js outer timeout fires (lose 30s margin).
    const hotelBudgetMs = 25_000;
    const outerTimeout = (params.timeout || 300_000) - 30_000;
    const hardDeadline = Date.now() + Math.min(outerTimeout, maxCards * hotelBudgetMs + 30_000);

    for (let i = 0; i < maxCards; i++) {
      if (Date.now() > hardDeadline) {
        console.log(`  [Google Hotels] Hit time budget at hotel ${i + 1}/${maxCards} — returning partial results`);
        break;
      }
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

      let distance = '—';
      let hotelAddress = '';

      // Navigate directly to the hotel's detail page via the card's <a href>.
      // Wait for networkidle so price-source XHRs finish, then for #prices
      // to render at least one $ value (not just the empty heading).
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
      // Wait for the price section to actually populate. innerText on #prices
      // returns empty (Google's components), so check via querySelectorAll.
      await page.waitForFunction(() => {
        const p = document.querySelector('#prices');
        if (!p) return false;
        const all = p.querySelectorAll('*');
        for (const el of all) {
          if (/\$\d{2,5}/.test(el.textContent || '')) return true;
        }
        return false;
      }, { timeout: 8_000 }).catch(() => {});

      // Scrape the hotel's full street address from the detail-page header.
      // User-confirmed XPath (indices vary slightly per hotel, like the Stay
      // Total trigger). Structural form: section first-row → div[2] > span[1].
      hotelAddress = await page.evaluate(() => {
        // Try a structural selector first; fall back to scanning section spans
        // for street-pattern text.
        const candidates = [];
        for (const sec of document.querySelectorAll('section')) {
          for (const sp of sec.querySelectorAll('div div div span')) {
            const t = (sp.textContent || '').trim();
            // Address heuristic: starts with a number, contains a comma.
            if (/^\d+\s+\w/.test(t) && t.includes(',') && t.length < 200) {
              candidates.push(t);
            }
          }
        }
        return candidates[0] || '';
      }).catch(() => '');

      if (originCoord) {
        const query = hotelAddress || `${property}, ${hint}`;
        const hotelCoord = await geocode(query);
        const miles = haversineMiles(originCoord, hotelCoord);
        if (miles != null) distance = `${miles.toFixed(1)} mi`;
      }
      console.log(`  [Google Hotels]   address: "${hotelAddress || '(fallback to property name)'}" → ${distance}`);

      // Each price row in #prices contains "<source/desc> $base $withFees $total Visit site"
      // and a "Visit site" anchor whose href is the booking link. Walk up from
      // each anchor to find its row container (the one whose textContent has
      // ≥3 dollar values), then capture {text, href} per row.
      const priceRows = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll('#prices'));
        const real = all[1] || all[0];
        if (!real) return [];
        const anchors = Array.from(real.querySelectorAll('a'))
          .filter(a => /visit site/i.test(a.textContent || ''));
        return anchors.map(a => {
          let row = a.parentElement;
          for (let depth = 0; depth < 8 && row; depth++) {
            const text = row.textContent || '';
            const dollars = text.match(/\$[\d,]+/g) || [];
            if (dollars.length >= 3) {
              return { text: text.replace(/\s+/g, ' ').trim(), href: a.href };
            }
            row = row.parentElement;
          }
          return { text: '', href: a.href };
        }).filter(r => r.text);
      }).catch(() => []);

      const KNOWN_SOURCES = [
        'Booking.com', 'Expedia', 'Hotels.com', 'Agoda', 'Priceline',
        'Trip.com', 'Trivago', 'Super.com', 'Orbitz', 'Hotwire', 'Travelocity',
        'Vio.com', 'Snaptravel', 'Kayak', 'Vrbo', 'Marriott', 'Hilton',
        'Hyatt', 'IHG', 'Choice', 'Best Western', 'Wyndham',
      ];

      // Parse the first triple-price match per row. m[2]=nightly_base,
      // m[3]=nightly_with_fees, m[4]=stay_total.
      const TRIPLE = /\$([\d,]+)\s*\$([\d,]+)\s*\$([\d,]+)/;
      const minTotal = nights * 40;
      const options = [];
      for (const { text, href } of priceRows) {
        const m = text.match(TRIPLE);
        if (!m) continue;
        const nightlyBase = parseFloat(m[1].replace(/,/g, ''));
        const nightlyFees = parseFloat(m[2].replace(/,/g, ''));
        const total = parseFloat(m[3].replace(/,/g, ''));
        if (!total || total < minTotal || total > 20_000) continue;
        const fees = Math.max(0, Math.round((nightlyFees - nightlyBase) * nights));
        const before = text.split(/\$/)[0].trim();
        const matchedSource = KNOWN_SOURCES.find(s =>
          before.toLowerCase().includes(s.toLowerCase())
        );
        const source = matchedSource || 'Hotel direct';
        options.push({ source, total, fees, href });
      }
      console.log(`  [Google Hotels] ${property}: parsed ${options.length} price row(s)`);

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
          distance,
          perNight: '$' + perNightNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
          total: '$' + opt.total.toLocaleString('en-US', { maximumFractionDigits: 0 }),
          fees: opt.fees ? '$' + opt.fees.toLocaleString('en-US') : '—',
          source: opt.source,
          sourceLink: opt.href || '',
          notes: `${nights} nights`,
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
