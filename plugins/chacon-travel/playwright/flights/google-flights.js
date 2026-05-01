import { humanDelay, detectCaptcha, inferFareIncludes, extractIATA } from '../sites/helpers.js';
import { bagFeesForTrip } from '../lib/bag-fees.js';

const SITE = 'Google Flights';

// Google Flights accepts a free-form ?q= search; e.g.
//   "Flights to OAK from ABQ on 2026-06-14 through 2026-06-18"
// This bypasses all of the form-fill brittleness on the homepage.
function buildUrl(params) {
  const orig = extractIATA(params.origin) || params.origin;
  const dest = extractIATA(params.destination) || params.destination;
  const q = `Flights to ${dest} from ${orig} on ${params.depart} through ${params.return}`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}`;
}

// Each result card text looks like (single line, whitespace collapsed):
//   "7:40 AM – 9:10 AM Southwest 2 hr 30 min ABQ–OAK Nonstop 129 kg CO2e ... $429 round trip"
// or with overnight:
//   "8:10 PM – 12:15 AM+1 Southwest 5 hr 5 min ABQ–OAK 1 stop 1 hr 40 min SAN ... $439 round trip"
//
// For return cards in the "Top returning flights" panel, the same shape applies
// but the price is the *combined* round-trip price for departing + this return.
function parseCard(text) {
  const timeM = text.match(/(\d{1,2}:\d{2}\s*[AP]M)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[AP]M)(\+\d+)?/i);
  if (!timeM) return null;

  const priceM = text.match(/\$([\d,]+)\s*round trip/i);
  // Return cards may not include "round trip" suffix in some layouts — fall back
  // to the first $NNN in the card.
  const fallbackPriceM = priceM || text.match(/\$([\d,]+)/);
  if (!fallbackPriceM) return null;
  const price = parseFloat(fallbackPriceM[1].replace(/,/g, ''));

  // Airline appears immediately after the time range. We boundary on either
  //   - "Operated by ..." (with or without preceding space, e.g. "DeltaOperated by")
  //   - the leg duration ("4 hr 23 min")
  //   - the airport pair ("ABQ-SFO")
  // and strip a leading "Separate tickets" badge that appears on return cards.
  const afterTime = text.slice(text.indexOf(timeM[0]) + timeM[0].length).trim();
  const cleanedAfter = afterTime.replace(/^Separate tickets[\s·•:.\-]*/i, '');
  // Try a known-airline list first — most reliable.
  const knownAirline = cleanedAfter.match(/^(United(?:\s+Airlines)?|Southwest(?:\s+Airlines)?|American(?:\s+Airlines)?|Delta(?:\s+Air\s+Lines)?|JetBlue(?:\s+Airways)?|Alaska(?:\s+Airlines)?|Spirit(?:\s+Airlines)?|Frontier(?:\s+Airlines)?|Hawaiian(?:\s+Airlines)?|Allegiant(?:\s+Air)?)/i);
  let airline;
  if (knownAirline) {
    airline = knownAirline[1].replace(/\s+/g, ' ').trim();
  } else {
    const airlineRaw = cleanedAfter.match(/^([A-Za-z][A-Za-z\s]+?)(?=Operated by|\s+\d+\s+hr|\s+[A-Z]{3}[–\-])/i)?.[1] || 'Unknown';
    airline = airlineRaw.trim();
  }

  const durM = text.match(/(\d+\s*hr(?:\s*\d+\s*min)?)\s+[A-Z]{3}[–\-][A-Z]{3}/i);
  const duration = durM ? durM[1].replace(/\s+/g, ' ') : null;

  const stopsM = text.match(/Nonstop|\d+\s+stop/i);
  const stops = stopsM ? stopsM[0] : '—';

  const timeRange = `${timeM[1]} – ${timeM[2]}${timeM[3] || ''}` + (duration ? ` (${duration})` : '');
  return { airline, timeRange, stops, price };
}

// After clicking a departing card, Google routes to the "Choose return" view.
// Wait for the "Top returning flights" heading, then scrape ONLY the cards
// under that section. The page also keeps the originally-clicked departing
// flight visible at the top, which uses the same li.pIav2d selector — we'd
// pick it up as a "return" otherwise (the bug we're fixing here).
async function scrapeReturnPanel(page) {
  // Wait for any "returning flights" / "return flights" heading. Some return
  // views (e.g. American Eagle) use slightly different copy.
  await page.locator('text=/return(ing)? flights/i').first()
    .waitFor({ timeout: 15_000 })
    .catch(() => {});
  await humanDelay(500, 800);

  const cardTexts = await page.evaluate(() => {
    const headings = Array.from(document.querySelectorAll('h3, h2'));
    const heading = headings.find(h =>
      /(top\s+)?return(ing)?\s+flights?/i.test(h.innerText)
      || /choose\s+return/i.test(h.innerText)
    );
    let section = heading?.parentElement;
    while (section && !section.querySelector('li.pIav2d')) {
      section = section?.parentElement;
    }
    // Fallback: if no heading found, scope to li.pIav2d cards on the page
    // EXCEPT the first one (which echoes the just-clicked departing card).
    if (!section) {
      const all = Array.from(document.querySelectorAll('li.pIav2d'));
      return all.slice(1).map(el => el.innerText.replace(/\s+/g, ' ').trim());
    }
    return Array.from(section.querySelectorAll('li.pIav2d'))
      .map(el => el.innerText.replace(/\s+/g, ' ').trim());
  }).catch(() => []);

  return cardTexts;
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    const searchUrl = buildUrl(params);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for the departing result list to render — no artificial pre-delay.
    await page.locator('li.pIav2d').first().waitFor({ timeout: 20_000 }).catch(() => {});
    // Short settle so all cards finish painting.
    await humanDelay(500, 800);

    const cap = await detectCaptcha(page);
    if (cap) return { site: SITE, error: 'CAPTCHA: ' + cap };

    // Scope to cards under the "Top departing flights" heading only — the
    // page also renders "Other departing flights" with the same li.pIav2d
    // selector, and we don't want to click into all of those.
    const departingTexts = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3, h2'));
      const topHeading = headings.find(h => /Top departing flights/i.test(h.innerText));
      if (!topHeading) {
        // Fallback: take the first list of pIav2d cards on the page.
        const list = document.querySelector('ul');
        if (!list) return [];
        return Array.from(list.querySelectorAll('li.pIav2d'))
          .map(el => el.innerText.replace(/\s+/g, ' ').trim());
      }
      // Walk up to the section that contains both the heading and the card list.
      let section = topHeading.parentElement;
      while (section && !section.querySelector('li.pIav2d')) {
        section = section.parentElement;
      }
      if (!section) return [];
      return Array.from(section.querySelectorAll('li.pIav2d'))
        .map(el => el.innerText.replace(/\s+/g, ' ').trim());
    }).catch(() => []);

    if (departingTexts.length === 0) {
      return { site: SITE, error: 'No flight cards found in "Top departing flights" section' };
    }

    console.log(`  [Google Flights] Found ${departingTexts.length} top departing flight(s) — clicking each`);

    const results = [];
    const seen = new Set();

    for (let i = 0; i < departingTexts.length; i++) {
      const departing = parseCard(departingTexts[i]);
      if (!departing) continue;
      if (departing.price < 50 || departing.price > 20_000) continue;

      // The "Top departing flights" cards are the first N li.pIav2d in DOM
      // order. Each card has multiple sub-buttons (CO2 info popup, expand
      // chevron, price), so a generic [role="button"] click hits the wrong
      // target. Click the time-range text — it sits on the card-level
      // navigation handler and reliably drills into the return panel.
      const card = page.locator('li.pIav2d').nth(i);
      await card.scrollIntoViewIfNeeded().catch(() => {});
      const timeText = card.locator('text=/\\d{1,2}:\\d{2}\\s*[AP]M\\s*[–\\-]\\s*\\d{1,2}:\\d{2}\\s*[AP]M/i').first();
      const hasTime = await timeText.count().then(c => c > 0).catch(() => false);
      if (hasTime) {
        await timeText.click({ timeout: 10_000 }).catch(() => {});
      } else {
        // Fallback: click upper-left of card where time/airline live
        await card.click({ position: { x: 60, y: 30 }, timeout: 10_000 }).catch(() => {});
      }

      const returnTexts = await scrapeReturnPanel(page);

      // Navigate back to the departing list for the next iteration.
      // Defer this so we don't navigate after the last card.
      const goBackAfter = i < departingTexts.length - 1;

      // Take top 2 return options per departing flight. Skip the first if it
      // duplicates the departing card text (rare but possible during transition).
      let added = 0;
      for (const rText of returnTexts) {
        if (added >= 2) break;
        const ret = parseCard(rText);
        if (!ret) continue;
        if (ret.price < 50 || ret.price > 20_000) continue;

        const dedupKey = `${departing.airline}:${departing.timeRange}:${ret.airline}:${ret.timeRange}:${ret.price}`;
        if (seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        // Use the return card's price as the real combined RT price.
        const baseRtPrice = ret.price;
        // Bag fees: charge per direction based on each leg's airline.
        const outFees = bagFeesForTrip(departing.airline, params.travelers);
        const retFees = bagFeesForTrip(ret.airline, params.travelers);
        const baseGroup = baseRtPrice * params.travelers;
        const totalGroup = baseGroup + outFees.outbound + retFees.return;

        results.push({
          airline: departing.airline === ret.airline
            ? departing.airline
            : `${departing.airline} / ${ret.airline}`,
          outbound: departing.timeRange,
          return_: ret.timeRange,
          stopsOut: departing.stops,
          stopsRet: ret.stops,
          stops: `${departing.stops} / ${ret.stops}`,
          includes: inferFareIncludes(departingTexts[i] + ' ' + rText, departing.airline),
          baseRtPrice,
          perPerson: '$' + baseRtPrice.toLocaleString('en-US') + ' RT',
          bagFees: `$${outFees.outbound} / $${retFees.return}`,
          total: '$' + totalGroup.toLocaleString('en-US'),
        });
        added++;
      }

      if (goBackAfter) {
        // Full reload via the original search URL — page.goBack() is unreliable
        // on GF's SPA routing: after the first iteration cached cards stop
        // re-binding click handlers and subsequent clicks yield zero returns.
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.locator('text=/Top departing flights/i').first()
          .waitFor({ timeout: 15_000 }).catch(() => {});
        await page.locator('li.pIav2d').first().waitFor({ timeout: 15_000 }).catch(() => {});
        await humanDelay(500, 800);
      }
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results parsed from cards — format may have changed' };
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
