import { humanDelay, detectCaptcha, waitForCaptchaSolve, parsePrice, inferFareIncludes } from '../sites/helpers.js';

const SITE = 'Expedia';

// Build direct search URL — bypasses form interactions entirely
function buildUrl(params) {
  const fmt = d => { const [y,m,day] = d.split('-'); return `${m}/${day}/${y}`; };
  return (
    'https://www.expedia.com/Flights-Search?' +
    `trip=roundtrip` +
    `&leg1=from:${encodeURIComponent(params.origin)},to:${encodeURIComponent(params.destination)},departure:${fmt(params.depart)}TANYT` +
    `&leg2=from:${encodeURIComponent(params.destination)},to:${encodeURIComponent(params.origin)},departure:${fmt(params.return)}TANYT` +
    `&passengers=adults:${params.travelers},children:0,infantinlap:Y` +
    `&options=cabinclass:coach` +
    `&mode=search`
  );
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    // Warm up session on Expedia homepage first to acquire cookies before search URL
    await page.goto('https://www.expedia.com', { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await humanDelay(2000, 3000);
    await page.goto(buildUrl(params), { waitUntil: 'domcontentloaded', timeout: 30_000 });

    // Wait for a flight card that ACTUALLY contains a price. Expedia renders
    // empty uitk-card skeletons (filter sidebar, ads) almost immediately, so
    // waiting on the bare class would return too early — actual results take
    // 10-20s to populate. Waiting on a card-with-price ensures results are in.
    // Also: Expedia embeds invisible CAPTCHA iframes for the sign-in widget
    // even on valid result pages, so we check results BEFORE checking CAPTCHA.
    await page.locator('[class*="uitk-card"]').filter({ hasText: /\$\d{2,4}/ }).first()
      .waitFor({ timeout: 35_000 })
      .catch(() => {});
    await humanDelay(1000, 1500);

    const hasResults = await page.locator('[class*="uitk-card"]').filter({ hasText: /\$\d/ }).count();
    if (hasResults === 0) {
      const _cap = await detectCaptcha(page);
      if (_cap) {
        const isHardBlock = ['blocked', 'human side', "can't tell"].some(s => _cap.includes(s));
        if (params.headed && !isHardBlock) {
          const solved = await waitForCaptchaSolve(page);
          if (!solved) return { site: SITE, error: 'CAPTCHA not solved — use /flights skill instead' };
        } else {
          return { site: SITE, error: 'CAPTCHA: ' + _cap + (isHardBlock ? ' (DataDome — use /flights skill)' : '') };
        }
      } else {
        return { site: SITE, error: 'No results found' };
      }
    }

    // Extract results in a single page.evaluate so we can do all DOM walking
    // (uniqueness, top-level filtering, threshold lookup) in one round trip.
    //
    // Two improvements over the previous parser:
    //   1. Top-level dedup — Expedia wraps each fare in nested uitk-card
    //      elements (outer container + inner panels), so a flat .all() returns
    //      ~3 cards per actual fare. We walk parents and skip cards nested
    //      inside another fare card.
    //   2. Carry-on threshold detection — Expedia's filter sidebar shows
    //      "Carry-on bag included $XXX" (the cheapest fare *with* a carry-on).
    //      Any fare priced below that threshold is Basic Economy by definition.
    const extracted = await page.evaluate(() => {
      const allCards = Array.from(document.querySelectorAll('[class*="uitk-card"]'))
        .filter(el => /Roundtrip per traveler/i.test(el.innerText));
      const topLevel = allCards.filter(el => {
        let p = el.parentElement;
        while (p) {
          if (allCards.includes(p)) return false;
          p = p.parentElement;
        }
        return true;
      });

      const carryOnMatch = document.body.innerText.match(/Carry-on bag included\s+\$(\d[\d,]+)/i);
      const carryOnThreshold = carryOnMatch ? parseFloat(carryOnMatch[1].replace(/,/g, '')) : null;

      return {
        carryOnThreshold,
        cards: topLevel.slice(0, 6).map(el => el.innerText.replace(/\s+/g, ' ').trim()),
      };
    }).catch(() => ({ carryOnThreshold: null, cards: [] }));

    const results = [];
    for (const cardText of extracted.cards) {
      const priceMatch = cardText.match(/\$(\d[\d,]+)/);
      if (!priceMatch) continue;
      const ppNum = parseFloat(priceMatch[1].replace(/,/g, ''));
      if (ppNum < 100 || ppNum > 5000) continue;

      const airline = cardText.match(/United Airlines|Southwest Airlines|American Airlines|Delta(?: Air Lines)?|JetBlue Airways|Alaska Airlines|Spirit Airlines|Frontier(?: Airlines)?/i)?.[0]
        || cardText.match(/United|Southwest|American|Delta|JetBlue|Alaska|Spirit|Frontier/i)?.[0]
        || 'See Expedia';
      const stopsMatch = cardText.match(/Nonstop|\d\+? stop/i);
      const stops = stopsMatch ? stopsMatch[0] : '—';
      const durationMatch = cardText.match(/(\d+h\s*\d+m)/);
      const duration = durationMatch ? durationMatch[1] : '';
      const route = duration ? `${params.depart} → ${params.return} (${duration})` : `${params.depart} → ${params.return}`;

      // Dedupe by airline + price + stops + duration so we get distinct itineraries
      const dedupKey = `${airline}:${ppNum}:${stops}:${duration}`;
      if (results.some(r => r._key === dedupKey)) continue;

      // Determine includes: if price < carry-on threshold, it's Basic Economy
      let includes;
      if (extracted.carryOnThreshold && ppNum < extracted.carryOnThreshold) {
        includes = `Personal item only (Basic — < $${extracted.carryOnThreshold} carry-on threshold)`;
      } else {
        includes = inferFareIncludes(cardText, airline);
      }

      results.push({
        _key: dedupKey,
        airline,
        route,
        stops,
        includes,
        perPerson: '$' + ppNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' RT',
        total: '$' + (ppNum * params.travelers).toLocaleString('en-US', { maximumFractionDigits: 0 }),
      });

      if (results.length >= 3) break;
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results parsed — selectors may need updating' };
    }

    results.forEach(r => delete r._key);
    return { site: SITE, results };

  } catch (err) {
    return { site: SITE, error: err.message };
  } finally {
    await page.close();
  }
}

search.siteName = SITE;
export default search;
