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
    // Programmatic .click() is swallowed by Google's jsaction handlers — use
    // Playwright's real-mouse click via locator instead.
    if (params.travelers !== 2) {
      const travelerBtn = page.locator('[role="button"][aria-label*="traveler" i], [role="button"][aria-label*="guest" i]').first();
      const triggerVisible = await travelerBtn.isVisible({ timeout: 2000 }).catch(() => false);
      if (triggerVisible) {
        const startLabel = await travelerBtn.getAttribute('aria-label').catch(() => '');
        await travelerBtn.scrollIntoViewIfNeeded().catch(() => {});
        await travelerBtn.click({ timeout: 3000 }).catch(() => {});
        await humanDelay(700, 1000);
        const delta = params.travelers - 2;
        const btnLabel = delta > 0 ? 'Add adult' : 'Remove adult';
        const adjustBtn = page.locator(`[aria-label="${btnLabel}"]`).first();
        const pickerOpen = await adjustBtn.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  [Google Hotels]   traveler picker opened: ${pickerOpen} | start: "${startLabel}"`);
        if (pickerOpen) {
          for (let i = 0; i < Math.abs(delta); i++) {
            await adjustBtn.click({ timeout: 2000 }).catch(() => {});
            await humanDelay(200, 350);
          }
          const pickerDone = page.locator('button').filter({ hasText: /^Done$/ }).last();
          if (await pickerDone.isVisible({ timeout: 1000 }).catch(() => false)) {
            await pickerDone.click({ timeout: 2000 }).catch(() => {});
            await humanDelay(400, 600);
          }
          const finalLabel = await travelerBtn.getAttribute('aria-label').catch(() => '');
          console.log(`  [Google Hotels]   travelers final: "${finalLabel}"`);
        }
      } else {
        console.log(`  [Google Hotels]   traveler picker trigger not visible — Google may default to 2`);
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
          // Find any anchor that links into Google Travel — used only to
          // navigate so we can scrape the detail page for address + vendor.
          // We don't trust this URL for Source Link (cards lack a stable
          // hotel-specific URL); the row's source_link is synthesized from
          // the property name later.
          const link = el.querySelector('a[href*="/travel/"]');
          const href = link ? link.href : null;
          // Headline price block — Google renders both `$X nightly` and
          // `$Y total` per card, but CSS-toggles which one is visible based
          // on the user's price-display preference. innerText only sees the
          // visible one; textContent sees both. Use textContent of the card
          // so we always get both values.
          const fullText = (el.textContent || '').replace(/\s+/g, ' ').trim();
          let nightly = null, total = null;
          // Try ordered "nightly ... total" first.
          let priceMatch = fullText.match(/\$([\d,]+)\s*nightly[\s\S]{0,80}?\$([\d,]+)\s*total/i);
          if (priceMatch) {
            nightly = parseFloat(priceMatch[1].replace(/,/g, ''));
            total = parseFloat(priceMatch[2].replace(/,/g, ''));
          } else {
            // Fall back to "total ... nightly" ordering.
            priceMatch = fullText.match(/\$([\d,]+)\s*total[\s\S]{0,80}?\$([\d,]+)\s*nightly/i);
            if (priceMatch) {
              total = parseFloat(priceMatch[1].replace(/,/g, ''));
              nightly = parseFloat(priceMatch[2].replace(/,/g, ''));
            }
          }
          return { idx, text, href, nightly, total };
        })
        .filter(({ text, href }) =>
          href
          && /\$\d{2,5}/.test(text)
          && !/^Sponsored\b/i.test(text)
          && !/results?$/i.test(text)
          && !/Prices in this area/i.test(text)
          && !/Hotels nearby/i.test(text)
          // Skip vacation rentals and apartments — they use a different DOM
          // for prices and burn drilldown budget.
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
    const hint = cityHint(params.destination);
    // Combine anchor with city hint so Nominatim disambiguates
    // ("Islands of Adventure" alone resolves to the Caribbean; with "Orlando, FL"
    // it correctly resolves to Universal Orlando).
    const anchorQuery = params.anchor
      ? `${params.anchor}, ${hint}`
      : params.destination;
    const originCoord = await geocode(anchorQuery);
    console.log(`  [Google Hotels]   origin geocoded (${params.anchor ? 'anchor' : 'destination'}: "${anchorQuery}"): ${originCoord ? `${originCoord.lat.toFixed(4)},${originCoord.lon.toFixed(4)}` : 'failed'} | city hint: "${hint}"`);

    // Per-hotel budget: SERP load (~10s) + N hotels × ~25s each. Cap so we
    // exit cleanly before the search.js outer timeout fires (lose 30s margin).
    const hotelBudgetMs = 25_000;
    const outerTimeout = (params.timeout || 300_000) - 30_000;
    const hardDeadline = Date.now() + Math.min(outerTimeout, maxCards * hotelBudgetMs + 30_000);

    const KNOWN_SOURCES = [
      'Booking.com', 'Expedia', 'Hotels.com', 'Agoda', 'Priceline',
      'Trip.com', 'Trivago', 'Super.com', 'Orbitz', 'Hotwire', 'Travelocity',
      'Vio.com', 'Snaptravel', 'Kayak', 'Vrbo', 'Marriott', 'Hilton',
      'Hyatt', 'IHG', 'Choice', 'Best Western', 'Wyndham',
    ];

    for (let i = 0; i < maxCards; i++) {
      if (Date.now() > hardDeadline) {
        console.log(`  [Google Hotels] Hit time budget at hotel ${i + 1}/${maxCards} — returning partial results`);
        break;
      }
      const { text: cardText, href, nightly: cardNightly, total: cardTotal } = hotelCardHandles[i];
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

      // Bail early if we can't trust the SERP-card price for this hotel.
      // Without it we'd be back to picking the cheapest tier off the detail
      // page, which historically returned implausible single-room rates.
      if (!cardTotal || !cardNightly) {
        console.log(`  [Google Hotels] ${property}: SERP card price not parseable — skipping`);
        continue;
      }

      let distance = '—';
      let hotelAddress = '';
      let cheapestSource = 'Hotel direct';

      // Drill into the detail page for: address (geocoding distance) and the
      // cheapest vendor's name. The headline price comes from the SERP card,
      // so we don't need to wait for the (slow) price section to finish XHRs.
      await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 15_000 }).catch(() => {});
      // Source Link = a Google Hotels search for the property name. Card
      // anchors lack a stable hotel-specific URL, so we synthesize a search
      // that lands the user on the same hotel's Google panel.
      const detailUrl = `https://www.google.com/travel/search?q=${encodeURIComponent(property + ', ' + hint)}&hl=en`;
      // Wait just for the page header to be ready so the address element exists.
      // Bail at 3s and accept whatever is there — address usually loads with the
      // initial DOM, vendor scrape can be a best-effort short wait.
      await page.locator('section').first().waitFor({ timeout: 3_000 }).catch(() => {});

      // Scrape the hotel's full street address from the detail-page header.
      hotelAddress = await page.evaluate(() => {
        for (const sec of document.querySelectorAll('section')) {
          for (const sp of sec.querySelectorAll('div div div span')) {
            const t = (sp.textContent || '').trim();
            if (/^\d+\s+\w/.test(t) && t.includes(',') && t.length < 200) {
              return t;
            }
          }
        }
        return '';
      }).catch(() => '');

      if (originCoord) {
        const query = hotelAddress || `${property}, ${hint}`;
        const hotelCoord = await geocode(query);
        const miles = haversineMiles(originCoord, hotelCoord);
        if (miles != null) distance = `${miles.toFixed(1)} mi`;
      }

      // Cheapest vendor name — pull the first known-provider mention from the
      // first row of #prices (rows are ordered cheapest-first by Google).
      cheapestSource = await page.evaluate((sources) => {
        const all = Array.from(document.querySelectorAll('#prices'));
        const real = all[1] || all[0];
        if (!real) return null;
        const text = (real.textContent || '').replace(/\s+/g, ' ');
        // First "Visit site" anchor scopes the cheapest row.
        const head = text.split(/visit site/i)[0] || text;
        for (const s of sources) {
          if (head.toLowerCase().includes(s.toLowerCase())) return s;
        }
        return null;
      }, KNOWN_SOURCES).catch(() => null) || 'Hotel direct';

      const fees = Math.max(0, cardTotal - cardNightly * nights);
      console.log(`  [Google Hotels] ${property}: $${cardNightly}/n base, $${cardTotal} stay total via ${cheapestSource} | ${distance}`);

      allRows.push({
        property,
        type: 'Hotel',
        rating,
        distance,
        hotelAddress,
        perNight: '$' + cardNightly.toLocaleString('en-US'),
        total: '$' + cardTotal.toLocaleString('en-US'),
        fees: fees > 0 ? '$' + fees.toLocaleString('en-US') : '—',
        source: cheapestSource,
        // Source Link goes to the Google Hotels detail page (not the booking
        // redirect) so the user can re-verify in one click. Use the URL we
        // landed on, not the SERP-captured href (which may be ambiguous).
        sourceLink: detailUrl,
        notes: `${nights} nights with taxes + fees`,
      });

      // Return to the SERP for the next hotel.
      if (i < maxCards - 1) {
        await page.goto(resultsUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
        await page.locator('main c-wiz span c-wiz > c-wiz').first()
          .waitFor({ timeout: 6_000 }).catch(() => {});
        await humanDelay(300, 500);
      }
    }

    if (allRows.length === 0) {
      return { site: SITE, error: 'No SERP-card prices parsed for any hotel' };
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
