# Southwest Vacations — UI Navigation

URL: https://www.southwest.com/vacations/

## Key Notes

- **Correct URL is `southwest.com/vacations/`** — not `southwestvacations.com` (that site redirects here).
- Field labels are **"From"** and **"To"** — the "From" field pre-fills based on user location (e.g., ABQ).
- **Use the destination's IATA airport code** in the "To" field — city names alone often fail autocomplete. Examples: `SAN` for San Diego, `MCO` for Orlando, `LAS` for Las Vegas. The autocomplete immediately shows a matching airport as the first option.
- **Default travelers is "1 Room, 2 Travelers"** — to add more adults, click the button and use the "+" stepper.
- Date inputs have `inputmode="none"` — keyboard input is blocked; calendar widget required.
- Results open in a **new tab** at `vacations.southwest.com/package/fh` — set up the `waitForEvent('page')` listener BEFORE clicking "Find a vacation" to avoid race condition.

## Playwright DOM Notes

### Destination Field
- Selector: `getByRole('combobox', { name: /^To$/i }).first()`
- Use `fill('{IATA_CODE}')` where `{IATA_CODE}` is the destination's airport code (e.g. `SAN` for San Diego, `LAS` for Las Vegas, `MCO` for Orlando) — city names alone often fail autocomplete; the airport code immediately shows the correct option
- Click the first `[role="option"]` or press ArrowDown + Enter if no option visible

### Date Fields
- IDs: `#departureDate` and `#returnDate`
- Both have `inputmode="none"` — keyboard input blocked
- **React state requires calendar UI confirmation** — DOM value changes alone are not enough

**Two-step date approach:**
1. Set DOM value via JS native setter (triggers React to navigate calendar to correct month):
   ```js
   const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
   setter.call(depart, '07/10'); // MM/DD format
   depart.dispatchEvent(new Event('input', { bubbles: true }));
   depart.dispatchEvent(new Event('change', { bubbles: true }));
   ```
2. Click the date input to open calendar → calendar opens already on the target month
3. Click the day cell in the calendar using `page.evaluate()` with proper MouseEvents:
   ```js
   el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
   el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
   el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
   ```
   **Important:** Simple `.click()` doesn't update React state — must dispatch mousedown + mouseup + click.

### Calendar Navigation
- Calendar navigation buttons have class `button[class*="passMouseEventsThrough"]`
- The `returnDate` input overlaps the calendar nav buttons, blocking Playwright pointer events
- Use `page.evaluate()` to click nav buttons (bypasses pointer event interception):
  ```js
  const btns = document.querySelectorAll('button[class*="passMouseEventsThrough"]');
  btns[btns.length - 1].click(); // last button = next month
  ```
- Calendar month is shown as "July 2026" (full month name) in the calendar header

### Finding Day Cells
- Day container: `[class*="days__"]` — days are DIV children
- To find a day: iterate `container.querySelectorAll('*')` and find leaf node with text matching `String(day)`
- Must dispatch proper MouseEvents (see above) — not `.click()`

### Travelers
- Button text: "N Travelers" or "Travelers"
- Default is 2 — click "+" to add more
- Close with "Apply" button (find by text `apply`)
- `dispatchEvent(new MouseEvent('click', { bubbles: true }))` works for the + button

## Steps (Playwright)

1. Navigate to `https://www.southwest.com/vacations/`
2. **To field**: `fill('{IATA_CODE}')` using the destination's airport code → click first `[role="option"]` or ArrowDown+Enter
3. **Dates**: JS native setter → click input to open calendar → click day cells via page.evaluate() with full MouseEvents
4. **Travelers**: Click travelers button → click "+" N-2 times → click Apply
5. Set up `context.waitForEvent('page')` listener BEFORE clicking search
6. Click "Find a vacation"
7. Await new tab at `vacations.southwest.com/package/fh`

## Reading Results

- Results page URL: `vacations.southwest.com/package/fh`
- Page title: "Southwest Vacations | Select a Hotel"
- Hotel cards are **`<li>` elements** matching: `Holiday N of N [HOTEL NAME] N.N stars ... The holiday price is $X,XXX.XX`
- **Prices are totals for all guests** — divide by traveler count for per-person
- Hotel name extraction regex: `/Holiday \d+ of \d+\s+(.+?)\s+(\d+(?:\.\d+)?)\s*stars?/i`
- Price extraction regex: `/holiday price is \$([\d,]+\.?\d*)/i`
- Default sort is "Recommended" — first 20 results shown on page 1 of 4
- Southwest Vacations packages only include Southwest Airlines flights
