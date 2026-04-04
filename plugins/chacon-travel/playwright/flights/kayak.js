import { humanDelay, detectCaptcha, waitForCaptchaSolve } from '../sites/helpers.js';

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

    // Wait for price text to appear — more reliable than waiting for specific class names
    await page.waitForSelector('text=/ person', { timeout: 25_000 }).catch(() => {});
    await humanDelay(1000, 2000);

    // Check we have actual flight prices on the page before looking for CAPTCHA
    const priceText = await page.locator('text=/ person').count().catch(() => 0);
    if (priceText === 0) {
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

    const results = [];

    // Kayak shows "$297 / person" with "$1,186 total" — extract from page sections
    // that contain an airline name + price pattern
    const allSections = await page.locator('[role="listitem"], article, [class*="result"]')
      .filter({ hasText: /\/ person/ })
      .all();

    // Fallback: parse full page text into flight blocks
    const pageText = allSections.length > 0 ? null : await page.textContent('body').catch(() => '');
    const sourceItems = allSections.length > 0 ? allSections : null;

    if (sourceItems) {
      for (const item of sourceItems.slice(0, 4)) {
        const t = await item.textContent().catch(() => '');
        if (!t) continue;
        if (!t.match(/United|Southwest|American|Delta|JetBlue|Alaska/i)) continue;

        const ppMatch = t.match(/\$(\d[\d,]+)\s*\/\s*person/i);
        const totalMatch = t.match(/\$([\d,]+)\s*total/i);
        if (!ppMatch) continue;

        const ppNum = parseFloat(ppMatch[1].replace(/,/g, ''));
        const totalNum = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : ppNum * params.travelers;
        if (ppNum < 100 || ppNum > 5000) continue;

        const airline = t.match(/United Airlines|Southwest Airlines|American Airlines|Delta|JetBlue Airways|Alaska Airlines/)?.[0] ||
                        t.match(/United|Southwest|American|Delta|JetBlue|Alaska/)?.[0] || 'See Kayak';
        const stops = t.match(/Nonstop|[1-3] stop/i)?.[0] || '—';
        const dur = t.match(/(\d+h\s*\d+m)/)?.[1] || '';

        // Deduplicate — skip if same price already captured
        if (results.some(r => r._ppNum === ppNum)) continue;

        results.push({
          _ppNum: ppNum,
          airline,
          route: `${params.depart} → ${params.return}` + (dur ? ` (${dur})` : ''),
          stops,
          perPerson: '$' + ppNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' RT',
          total: '$' + totalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        });
        if (results.length >= 2) break;
      }
    }

    // Fallback: regex scan on full page text
    if (results.length === 0 && pageText) {
      const blocks = pageText.split(/\$\d[\d,]+\s*\/\s*person/i);
      for (let i = 1; i < blocks.length && results.length < 2; i++) {
        const chunk = blocks[i - 1].slice(-200) + '$' + blocks[i].slice(0, 200);
        const ppMatch = chunk.match(/\$(\d[\d,]+)\s*\/\s*person/i);
        const totalMatch = chunk.match(/\$([\d,]+)\s*total/i);
        if (!ppMatch) continue;
        const ppNum = parseFloat(ppMatch[1].replace(/,/g, ''));
        const totalNum = totalMatch ? parseFloat(totalMatch[1].replace(/,/g, '')) : ppNum * params.travelers;
        if (ppNum < 100 || ppNum > 5000) continue;
        const airline = chunk.match(/United|Southwest|American|Delta|JetBlue|Alaska/i)?.[0] || 'See Kayak';
        results.push({
          airline,
          route: `${params.depart} → ${params.return}`,
          stops: chunk.match(/Nonstop|[1-3] stop/i)?.[0] || '—',
          perPerson: '$' + ppNum.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' RT',
          total: '$' + totalNum.toLocaleString('en-US', { maximumFractionDigits: 0 }),
        });
      }
    }

    if (results.length === 0) {
      return { site: SITE, error: 'No results parsed — selectors may need updating' };
    }

    // Strip internal dedup keys before returning
    results.forEach(r => delete r._ppNum);
    return { site: SITE, results };

  } catch (err) {
    return { site: SITE, error: err.message };
  } finally {
    await page.close();
  }
}

search.siteName = SITE;
export default search;
