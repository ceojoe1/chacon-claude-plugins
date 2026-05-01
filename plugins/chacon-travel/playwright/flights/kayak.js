import { humanDelay, detectCaptcha, waitForCaptchaSolve, inferFareIncludes, extractIATA } from '../sites/helpers.js';
import { bagFeesForTrip } from '../lib/bag-fees.js';

const SITE = 'Kayak';

// Resolve a 3-letter IATA code from inputs like "San Francisco, CA",
// "San Francisco, CA (SFO)", or bare "ABQ". Uses the shared city-name
// lookup table; falls back to the first slug of letters only if all else
// fails (which is incorrect for full city names like "San Francisco" — that
// fallback caused us to silently search San Diego (SAN) before).
function extractCode(str) {
  const iata = extractIATA(str);
  if (iata) return iata;
  // Last-ditch fallback: take the first 3 uppercase letters or the first 3
  // letters of the slug. This is unreliable; if you hit it, add the city to
  // the helpers.js CITY_TO_IATA table.
  const m = str.match(/\b([A-Z]{3})\b/);
  return m ? m[1] : str.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
}

// Kayak direct URL with a minimal filter chain:
//   sort=bestflight_a   "Best" sort (Kayak's price+time+stops blend)
//   cabin=-f            exclude first class
//   stops=-2            max 1 stop
//   hidebasic           hide basic economy fares
// Removed: bfc=1/cfc=1 (require-free-bags — filtered everything to Southwest),
// airlines=-AS, providers=-ONLY_DIRECT,AS,B6 (excluded Alaska + JetBlue + the
// cheapest "book direct" provider links). Bag fees are added in the cost calc.
function buildUrl(params) {
  const orig = extractCode(params.origin);
  const dest = extractCode(params.destination) || 'ORL';
  const adults = params.travelers > 1 ? `/${params.travelers}adults` : '';
  const fs = encodeURIComponent('cabin=-f;stops=-2;hidebasic=hidebasic');
  return `https://www.kayak.com/flights/${orig}-${dest}/${params.depart}/${params.return}${adults}?sort=bestflight_a&fs=${fs}`;
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(buildUrl(params), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // No artificial delay — the .waitFor on a real result card below blocks
    // until results actually render.

    // Per debugging/kayak.md, the result list lives at
    //   #flight-results-list-wrapper > div:nth-child(3) > div.Fxw9 > div
    // and each itinerary is a direct child div of that container. Wait for
    // one to render with a price + airline so we know real results (not
    // skeleton placeholders) have loaded.
    const RESULT_LIST = '#flight-results-list-wrapper > div:nth-child(3) > div.Fxw9 > div > div';
    await page.locator(RESULT_LIST).filter({
      hasText: /\$\d{3,4}.*?(United|Southwest|American|Delta|JetBlue|Alaska|Frontier|Spirit)/i,
    }).first().waitFor({ timeout: 30_000 }).catch(() => {});
    // Brief settle so additional cards finish rendering — drops 1-2s.
    await humanDelay(400, 700);

    const cardCount = await page.locator(RESULT_LIST).count().catch(() => 0);
    if (cardCount === 0) {
      const _cap = await detectCaptcha(page);
      if (_cap) {
        if (params.headed) {
          const solved = await waitForCaptchaSolve(page);
          if (!solved) return { site: SITE, error: 'CAPTCHA not solved — use /flights skill instead' };
        } else {
          return { site: SITE, error: 'CAPTCHA: ' + _cap };
        }
      } else {
        return { site: SITE, error: 'No results found — page may not have loaded' };
      }
    }

    // The Fxw9 container also includes header tabs (Cheapest/Best/Quickest)
    // and ad/summary cells as direct children — so we can't trust raw nth-child
    // ordering. Filter to true flight cards: must contain at least 2 time
    // pairs (outbound + return), an airline name, and a 3+ digit price. We
    // also include Kayak's "Go to result details" string as a card marker
    // (the header tabs and ad cells lack it).
    const cardTexts = await page.locator(RESULT_LIST).evaluateAll(els => {
      const timePairRe = /\d{1,2}:\d{2}\s*[ap]m\s*[–\-]\s*\d{1,2}:\d{2}\s*[ap]m/gi;
      const airlineRe = /United|Southwest|American|Delta|JetBlue|Alaska|Spirit|Frontier|Hawaiian/i;
      const priceRe = /\$\d{3,}/;
      const detailMarker = /Go to result details/i;
      const passed = [];
      for (const el of els) {
        const t = el.innerText.replace(/\s+/g, ' ').trim();
        if (t.length < 50) continue;
        if (!detailMarker.test(t)) continue;
        const timeMatches = t.match(timePairRe) || [];
        if (timeMatches.length < 2) continue;
        if (!airlineRe.test(t) || !priceRe.test(t)) continue;
        passed.push(t);
        if (passed.length >= 5) break;
      }
      return passed;
    }).catch(() => []);

    const results = [];
    for (const cardText of cardTexts) {
      // Skip ad / sponsored cards. Kayak marks them with " Ad " (with spaces
      // around the literal text near the price) or "paid placement"/"Book now,
      // pay later" in the body.
      if (/paid placement|Book now, pay later/i.test(cardText)) continue;
      if (/\sAd\s+\$\d/.test(cardText)) continue;
      // Must have at least one departure time pattern + airline + a price
      if (!/\d{1,2}:\d{2}\s*[ap]m/i.test(cardText)) continue;

      const airline = cardText.match(/United Airlines|Southwest Airlines|American Airlines|Delta(?: Air Lines)?|JetBlue Airways|Alaska Airlines|Spirit Airlines|Frontier(?: Airlines)?/i)?.[0]
        || cardText.match(/United|Southwest|American|Delta|JetBlue|Alaska|Spirit|Frontier/i)?.[0]
        || 'See Kayak';

      // Each card surfaces 1-2 fare tiers inline, e.g.:
      //   "$409 Basic Economy Select $489 Economy Select"
      //   "$434 Basic View Deal $514 Choice View Deal"
      // Capture each "$NNN <TierName>" pair so we can show price-vs-amenity.
      const tierPattern = /\$(\d{3,4})\s+(Basic Economy|Basic|Economy|Main Cabin|Choice|Standard|Flexible|First|Premium Economy)\b/gi;
      const tiers = [...cardText.matchAll(tierPattern)].map(m => ({
        price: parseFloat(m[1]),
        tierName: m[2],
      }));

      // Fall back to the first $NNN if no tier label was found
      if (tiers.length === 0) {
        const fallback = cardText.match(/\$(\d{3,4})\b/);
        if (!fallback) continue;
        tiers.push({ price: parseFloat(fallback[1]), tierName: '' });
      }

      // Time ranges — Kayak cards show outbound and return as two separate
      // time pairs in document order. Capture all and assume [0]=outbound,
      // [1]=return.
      const timeMatches = [...cardText.matchAll(/(\d{1,2}:\d{2}\s*[ap]m)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[ap]m)/gi)];
      const stopMatches = [...cardText.matchAll(/nonstop|\d+\s*stop/gi)].map(m => m[0]);
      // Durations — Kayak cards intermix leg totals ("6h 05m AUS - OAK") with
      // layover durations ("1h 20m layover, Dallas..."). Exclude any "Xh Ym"
      // immediately followed by " layover" so we keep only leg totals in
      // document order. The first two surviving matches are outbound and
      // return leg totals respectively.
      const durMatches = [...cardText.matchAll(/(\d+)h\s*(\d+)m(?!\s*layover)/gi)]
        .map(m => ({ text: m[0], minutes: parseInt(m[1]) * 60 + parseInt(m[2]) }));

      const fmtLeg = (timeM, dur) => {
        if (!timeM) return '—';
        const base = `${timeM[1]} – ${timeM[2]}`;
        return dur ? `${base} (${dur})` : base;
      };
      const outbound = fmtLeg(timeMatches[0], durMatches[0]?.text);
      const returnLeg = fmtLeg(timeMatches[1], durMatches[1]?.text);
      const stopsOut = stopMatches[0] || '—';
      const stopsRet = stopMatches[1] || stopMatches[0] || '—';
      const stopsCombined = `${stopsOut} / ${stopsRet}`;

      // Emit only the cheapest tier per card (kayak.md spec: "select all the
      // available flights (5 max)" — one row per itinerary, not per tier).
      const cheapestTier = tiers.slice().sort((a, b) => a.price - b.price)[0];
      for (const tier of [cheapestTier]) {
        if (tier.price < 100 || tier.price > 5000) continue;
        const dedupKey = `${airline}:${tier.price}:${stopsCombined}:${outbound}`;
        if (results.some(r => r._key === dedupKey)) continue;

        // Build a tier-specific context for inferFareIncludes — Kayak's tier
        // name is more reliable than scanning the whole card text.
        const includesContext = tier.tierName ? `${tier.tierName}` : cardText;
        const fees = bagFeesForTrip(airline, params.travelers);
        const baseGroup = tier.price * params.travelers;
        const totalGroup = baseGroup + fees.total;
        results.push({
          _key: dedupKey,
          airline,
          outbound,
          return_: returnLeg,
          stopsOut,
          stopsRet,
          stops: stopsCombined,
          includes: inferFareIncludes(includesContext, airline),
          baseRtPrice: tier.price,
          perPerson: '$' + tier.price.toLocaleString('en-US') + ' RT',
          bagFees: `$${fees.outbound} / $${fees.return}`,
          total: '$' + totalGroup.toLocaleString('en-US'),
        });
      }

      if (results.length >= 5) break;
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
