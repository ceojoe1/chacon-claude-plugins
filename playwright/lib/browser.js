import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

chromium.use(StealthPlugin());

/**
 * Launches a browser. Tries system Chrome first (better bot-detection bypass),
 * falls back to Playwright's bundled Chromium.
 * @param {object} options
 * @param {boolean} options.headed - Show the browser window (default: false)
 */
export async function launchBrowser({ headed = false } = {}) {
  const args = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
  ];

  // Try system Chrome first — real Chrome fingerprint avoids many bot checks
  try {
    return await chromium.launch({
      headless: !headed,
      channel: 'chrome', // uses installed Google Chrome
      args,
    });
  } catch {
    // Chrome not installed — fall back to bundled Chromium
    return await chromium.launch({
      headless: !headed,
      args,
    });
  }
}

/**
 * Creates a new browser context with realistic browser fingerprint.
 */
export async function newStealthContext(browser) {
  const ctx = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezoneId: 'America/Chicago',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // Mask webdriver flag
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Spoof plugins length to look like a real browser
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  return ctx;
}
