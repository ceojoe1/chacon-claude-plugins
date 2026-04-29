/**
 * Shared utilities for all site modules.
 */

/**
 * Waits a random duration between min and max milliseconds.
 * Simulates human interaction timing.
 */
export function humanDelay(min = 300, max = 700) {
  const ms = min + Math.random() * (max - min);
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Parses a price string to a formatted dollar amount.
 * "$1,168" → "$1,168"  (preserved)
 * "1168"   → "$1,168"
 * Returns "—" if not parseable.
 */
export function parsePrice(text) {
  if (!text) return '—';
  const cleaned = String(text).replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return '—';
  return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * Parses a per-person price from a total price string.
 * If the site shows a total, divide by travelers.
 */
export function pricePerPerson(totalText, travelers) {
  if (!totalText) return '—';
  const cleaned = String(totalText).replace(/[^0-9.]/g, '');
  const total = parseFloat(cleaned);
  if (isNaN(total)) return '—';
  const pp = total / travelers;
  return '$' + pp.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

/**
 * In headed mode, pauses for up to `waitMs` for the user to manually solve a CAPTCHA,
 * then re-checks. Returns true if CAPTCHA was solved (page cleared), false if still present.
 */
export async function waitForCaptchaSolve(page, waitMs = 120_000) {
  console.log(`\n  [CAPTCHA] Waiting up to ${waitMs / 1000}s for manual solve in browser...`);
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    await humanDelay(3000, 3000);
    // Page may have been closed — bail out cleanly
    if (page.isClosed()) return false;
    const cap = await detectCaptcha(page);
    if (!cap) {
      console.log('  [CAPTCHA] Cleared — continuing.\n');
      return true;
    }
  }
  console.log('  [CAPTCHA] Timed out waiting for solve.\n');
  return false;
}

/**
 * Detects CAPTCHA / bot-block pages.
 * Returns the matched signal string if detected, null otherwise.
 */
export async function detectCaptcha(page) {
  try {
    const bodyText = await page.textContent('body', { timeout: 3000 }).catch(() => '');
    const signals = [
      'unusual traffic',
      'verify you are human',
      'hcaptcha',
      'i am not a robot',
      'are you a bot',
      'robot or human',
      // DataDome (Expedia, etc.)
      "you have been blocked",
      "we can't tell if you're a human",
      "show us your human side",
      // Cloudflare
      'checking if the site connection is secure',
      'enable javascript and cookies',
    ];
    const lower = bodyText.toLowerCase();
    const matched = signals.find(s => lower.includes(s));
    if (matched) return matched;

    // "security check" needs care — Southwest's results page mentions
    // "security checkpoints" (TSA), so we require challenge-related wording.
    if (/\bsecurity check\b(?!\w*points?\b)(?:.*?(?:complete|verify|continue|please|required))/is.test(bodyText)) {
      return 'security check challenge';
    }

    // Captcha iframes — many sites (Kayak, Expedia) embed reCAPTCHA's invisible
    // preload iframe (/recaptcha/api2/aframe, 0x0, hidden) on every page load
    // for risk scoring. Only count iframes that are actually visible to the user.
    const visibleCaptchaFrames = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll(
        'iframe[src*="captcha"], iframe[src*="recaptcha"], iframe[src*="hcaptcha"]'
      ));
      return frames.filter(f => {
        // Skip preload/aframe variants — they're never user-facing
        if (/\/aframe(\?|$)/.test(f.src)) return false;
        // Must have non-zero dimensions and be in layout
        return f.offsetParent !== null && f.offsetWidth > 0 && f.offsetHeight > 0;
      }).length;
    }).catch(() => 0);
    if (visibleCaptchaFrames > 0) return 'captcha iframe';

    return null;
  } catch {
    return null;
  }
}

/**
 * Navigates a calendar date picker to select a specific date.
 * Assumes a two-month calendar with forward navigation buttons.
 *
 * @param {import('playwright').Page} page
 * @param {string} dateStr - YYYY-MM-DD
 * @param {object} options
 * @param {string} options.nextMonthSelector - CSS selector for the "next month" button
 * @param {string} options.daySelector - CSS selector template for day cells (receives the day number)
 */
export async function selectCalendarDate(page, dateStr, options = {}) {
  const {
    nextMonthSelector = 'button[aria-label="Next month"], button[aria-label*="next month"], [data-stid="datepicker-next"], [data-testid="month-navigation-next"]',
    daySelector = null,
  } = options;

  const target = new Date(dateStr + 'T12:00:00'); // noon to avoid TZ shifts
  const targetYear = target.getFullYear();
  const targetMonth = target.getMonth(); // 0-indexed
  const targetDay = target.getDate();

  // Try to click the matching day — navigate forward month by month until found
  for (let attempts = 0; attempts < 12; attempts++) {
    // Look for the day number in visible calendar cells
    const dayLocator = daySelector
      ? page.locator(daySelector.replace('{day}', targetDay))
      : page.locator(`[aria-label*="${targetDay}"]`).filter({ hasText: String(targetDay) }).first();

    // Check if target month/year is visible in the calendar header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const targetMonthName = monthNames[targetMonth];

    const calendarText = await page.locator('[role="dialog"], [role="grid"], .DayPicker, .rdp, [class*="calendar"], [class*="Calendar"]')
      .first()
      .textContent({ timeout: 2000 })
      .catch(() => '');

    if (calendarText.includes(targetMonthName) && calendarText.includes(String(targetYear))) {
      // We're on the right month — click the day
      // Try aria-label approach first (most reliable)
      const dayCell = page.locator(`[aria-label*="${targetMonthName} ${targetDay}"], [aria-label*="${targetDay} ${targetMonthName}"]`).first();
      const dayVisible = await dayCell.isVisible().catch(() => false);
      if (dayVisible) {
        await dayCell.click();
        await humanDelay(300, 500);
        return;
      }

      // Fallback: click the first cell containing just the target day number
      const cells = await page.locator('td[role="gridcell"], [role="button"][tabindex]').all();
      for (const cell of cells) {
        const text = (await cell.textContent().catch(() => '')).trim();
        if (text === String(targetDay)) {
          const isDisabled = await cell.getAttribute('aria-disabled').catch(() => null);
          if (isDisabled !== 'true') {
            await cell.click();
            await humanDelay(300, 500);
            return;
          }
        }
      }
    }

    // Navigate to next month
    const nextBtn = page.locator(nextMonthSelector).first();
    const btnVisible = await nextBtn.isVisible({ timeout: 2000 }).catch(() => false);
    if (!btnVisible) break;
    await nextBtn.click();
    await humanDelay(400, 700);
  }
}

/**
 * Types text into a field with per-character delay to simulate human typing.
 */
export async function humanType(page, selector, text, delayMs = 80) {
  await page.locator(selector).click();
  await humanDelay(200, 400);
  // Clear existing value
  await page.locator(selector).selectText().catch(() => {});
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.keyboard.type(text, { delay: delayMs });
}

/**
 * Extracts a 3-letter IATA airport code from inputs like:
 *   "Phoenix, AZ (PHX)"  → "PHX"   (parenthesized)
 *   "ABQ"                 → "ABQ"   (already a code)
 *   "Albuquerque, NM"     → "ABQ"   (city lookup)
 *   "Some unknown place"  → null
 */
const CITY_TO_IATA = {
  albuquerque: 'ABQ',
  atlanta: 'ATL',
  austin: 'AUS',
  baltimore: 'BWI',
  boston: 'BOS',
  charlotte: 'CLT',
  chicago: 'ORD',
  dallas: 'DFW',
  denver: 'DEN',
  detroit: 'DTW',
  honolulu: 'HNL',
  houston: 'IAH',
  'kansas city': 'MCI',
  'las vegas': 'LAS',
  'los angeles': 'LAX',
  miami: 'MIA',
  minneapolis: 'MSP',
  nashville: 'BNA',
  newark: 'EWR',
  'new orleans': 'MSY',
  'new york': 'JFK',
  nyc: 'JFK',
  oakland: 'OAK',
  orlando: 'MCO',
  philadelphia: 'PHL',
  phoenix: 'PHX',
  pittsburgh: 'PIT',
  portland: 'PDX',
  raleigh: 'RDU',
  sacramento: 'SMF',
  'salt lake city': 'SLC',
  'san antonio': 'SAT',
  'san diego': 'SAN',
  'san francisco': 'SFO',
  'san jose': 'SJC',
  seattle: 'SEA',
  'st louis': 'STL',
  'st. louis': 'STL',
  tampa: 'TPA',
  'washington': 'DCA',
  'washington dc': 'DCA',
};

export function extractIATA(input) {
  if (!input) return null;
  const paren = input.match(/\(([A-Z]{3})\)/);
  if (paren) return paren[1];
  const trimmed = input.trim();
  if (/^[A-Z]{3}$/i.test(trimmed)) return trimmed.toUpperCase();
  // City lookup — strip state/country suffix ("Phoenix, AZ" → "phoenix")
  const cityKey = trimmed.split(',')[0].toLowerCase().trim();
  return CITY_TO_IATA[cityKey] || null;
}

/**
 * Infers what amenities a flight fare includes from card text + airline.
 * Returns a short label like "Carry-on, Seat" or "Personal item only (Basic)".
 *
 * Heuristic — meant for the results table at-a-glance. Airlines change tier
 * names regularly, so we match common substrings; default assumes a standard
 * coach fare (carry-on + seat selection).
 *
 * @param {string} cardText - Full text of the fare card
 * @param {string} airline - Airline name (e.g. "United", "Southwest")
 */
export function inferFareIncludes(cardText, airline = '') {
  const t = (cardText || '').toLowerCase();
  const a = (airline || '').toLowerCase();

  // Southwest is special — every tier includes carry-on + 2 free checked bags
  if (a.includes('southwest')) {
    if (/choice extra|all in/i.test(cardText)) return 'Carry-on, 2 bags, Extra legroom';
    if (/choice preferred|earlier access/i.test(cardText)) return 'Carry-on, 2 bags, Preferred seat';
    if (/\bchoice\b|top pick/i.test(cardText)) return 'Carry-on, 2 bags, Seat';
    if (/\bbasic\b|go for less/i.test(cardText)) return 'Carry-on, 2 bags (no seat)';
    return 'Carry-on, 2 bags';
  }

  // Basic Economy across major US carriers — strict "personal item only"
  if (/basic economy|basic eco|\bbasic\b(?! plus)/i.test(cardText)) {
    return 'Personal item only (Basic)';
  }
  if (/saver fare|spirit saver|frontier basic/i.test(cardText)) {
    return 'Personal item only (Saver)';
  }

  // Google Flights bag-icon indicator. GF renders two small icons (carry-on,
  // checked bag) right before the price — these surface in innerText as "0 0",
  // "1 0", or "1 1". "0 0" right before "$" means neither is included = Basic.
  // Pattern requires both to be 0 (Basic Eco), preceded by a non-digit so we
  // don't catch e.g. "20 0 mins" boundaries.
  if (/(?<=\D)0\s+0\s+\$/.test(cardText)) {
    return 'Personal item only (Basic — bag icons)';
  }

  // Premium / Comfort tiers
  if (/first class|business class/i.test(cardText)) return 'Carry-on, Bag, Premium seat';
  if (/premium economy|comfort\+|premium plus/i.test(cardText)) return 'Carry-on, Bag, Extra legroom';

  // Main Cabin / Standard Economy tiers — explicit signals.
  // Bare "Economy" (when not "Basic Economy") = standard coach with carry-on
  // and seat selection on all US majors.
  if (/main cabin|standard economy|economy plus|main fare|^economy\b|\beconomy\b(?!\s*\(?(basic|saver))/i.test(cardText)
      && !/basic\s*economy/i.test(cardText)) {
    return 'Carry-on, Seat';
  }
  if (/\bchoice\b/i.test(cardText)) {
    return 'Carry-on, 2 bags, Seat';
  }

  // No explicit signal found — be honest about the uncertainty. Many aggregators
  // surface Basic Economy as the cheapest fare without labeling it inline, so
  // an optimistic "Carry-on, Seat" default would mislead. Hedge instead.
  return 'Standard? (verify on site)';
}

/**
 * Selects the first autocomplete suggestion after typing in a field.
 * Uses keyboard navigation (ArrowDown + Enter) which is more reliable than
 * clicking [role="option"] elements that may not be visible in the DOM.
 */
export async function selectAutocomplete(page) {
  await humanDelay(600, 900);
  // Try clicking first visible option
  const visibleOption = page.locator('[role="listbox"] [role="option"], [role="option"]').first();
  const isVisible = await visibleOption.isVisible({ timeout: 1500 }).catch(() => false);
  if (isVisible) {
    await visibleOption.click();
    await humanDelay(300, 500);
    return;
  }
  // Fallback: keyboard navigation
  await page.keyboard.press('ArrowDown');
  await humanDelay(150, 250);
  await page.keyboard.press('Enter');
  await humanDelay(300, 500);
}
