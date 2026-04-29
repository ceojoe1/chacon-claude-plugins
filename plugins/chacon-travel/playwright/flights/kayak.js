import { humanDelay, detectCaptcha, waitForCaptchaSolve, inferFareIncludes } from '../sites/helpers.js';

const SITE = 'Kayak';

// Kayak direct URL: /flights/ABQ-ORL/2026-07-10/2026-07-17/4adults
function buildUrl(params) {
  const extractCode = str => {
    const match = str.match(/\b([A-Z]{3})\b/);
    return match ? match[1] : str.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 3);
  };
  const orig = extractCode(params.origin);
  const dest = extractCode(params.destination) || 'ORL';
  return `https://www.kayak.com/flights/${orig}-${dest}/${params.depart}/${params.return}/${params.travelers}adults?sort=bestflight_a`;
}

async function search(context, params) {
  const page = await context.newPage();
  try {
    await page.goto(buildUrl(params), { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await humanDelay(3000, 4000); // Kayak loads results asynchronously

    // Wait for an actual flight result card to appear. The class
    // "Fxw9-result-item-container" wraps each itinerary; we filter to ones
    // containing both a price AND an airline so we know real results loaded
    // (not just the filter sidebar / ad placeholders).
    await page.locator('.Fxw9-result-item-container').filter({
      hasText: /\$\d{3,4}.*?(United|Southwest|American|Delta|JetBlue|Alaska|Frontier|Spirit)/i,
    }).first().waitFor({ timeout: 30_000 }).catch(() => {});
    await humanDelay(1000, 2000);

    const cardCount = await page.locator('.Fxw9-result-item-container').count().catch(() => 0);
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

    // Pull text of all top-level result cards in one round trip
    const cardTexts = await page.locator('.Fxw9-result-item-container').evaluateAll(els =>
      els.map(el => el.innerText.replace(/\s+/g, ' ').trim()).filter(t => t.length > 50)
    ).catch(() => []);

    const results = [];
    for (const cardText of cardTexts) {
      // Skip ad cards ("Book now, pay later", "paid placement") — they lack
      // proper flight time pairs.
      if (/paid placement|Book now, pay later/i.test(cardText)) continue;
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

      // Time range — outbound leg
      const timeMatch = cardText.match(/(\d{1,2}:\d{2}\s*[ap]m)\s*[–\-]\s*(\d{1,2}:\d{2}\s*[ap]m)/i);
      const route = timeMatch ? `${timeMatch[1]} – ${timeMatch[2]}` : `${params.depart} → ${params.return}`;
      const stops = cardText.match(/nonstop|\d+\s*stop/i)?.[0] || '—';
      // Pick the longest "Xh Ym" duration on the card — the first match is
      // typically a layover ("0h 40m layover"), not the total flight duration.
      const durMatches = [...cardText.matchAll(/(\d+)h\s*(\d+)m/g)]
        .map(m => ({ text: m[0], minutes: parseInt(m[1]) * 60 + parseInt(m[2]) }))
        .filter(d => d.minutes >= 60); // exclude sub-hour layovers
      durMatches.sort((a, b) => b.minutes - a.minutes);
      const dur = durMatches[0]?.text || '';
      const routeFull = dur ? `${route} (${dur})` : route;

      for (const tier of tiers.slice(0, 2)) {
        if (tier.price < 100 || tier.price > 5000) continue;
        const dedupKey = `${airline}:${tier.price}:${stops}:${dur}`;
        if (results.some(r => r._key === dedupKey)) continue;

        // Build a tier-specific context for inferFareIncludes — Kayak's tier
        // name is more reliable than scanning the whole card text.
        const includesContext = tier.tierName ? `${tier.tierName}` : cardText;
        results.push({
          _key: dedupKey,
          airline,
          route: routeFull,
          stops,
          includes: inferFareIncludes(includesContext, airline),
          perPerson: '$' + tier.price.toLocaleString('en-US') + ' RT',
          total: '$' + (tier.price * params.travelers).toLocaleString('en-US'),
        });
      }

      if (results.length >= 4) break;
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
