# Kayak Hotels — UI Navigation

URL: https://www.kayak.com/hotels (redirects to /stays)

## Key Notes

- **URL redirects**: `kayak.com/hotels` now redirects to `kayak.com/stays`
- **Two different calendar UIs** depending on session/cookies:
  - **Fresh context (no cookies)**: Paginated calendar showing 2 months; navigate with `div[aria-label="Next Month"]` buttons
  - **Logged-in/existing session**: Scrollable calendar (`.Qe5W`, scrollHeight ~4054px); scroll via mouse wheel
- **Search opens new tab**: Set up `context.waitForEvent('page')` BEFORE clicking Search
- **Results open at**: `kayak.com/hotels/[city-slug]/[YYYY-MM-DD]/[YYYY-MM-DD]/[N]adults`
- **CAPTCHA**: Frequently triggered on results page in fresh Playwright context; use Chrome MCP fallback

## DOM Selectors

### Destination
- Trigger: `div[tabindex="0"]` — click to reveal `input[placeholder*="city, hotel"]`
- Autocomplete: `[role="option"]`

### Calendar (Fresh/Paginated Context)
- Previous month: `div[aria-label="Previous month"]` (class `c1fvi`)
- Next month: `div[aria-label="Next Month"]` (class `c1fvi`)
- Day cells: `div.vn3g-button` with `aria-label="July 10, 2026 Average"` (prefix match works)
- Format: `"Month Day, Year Cheaper/Average/Higher"`
- Click requires full mouse events: `mouseenter, mouseover, mousedown, mouseup, click`

### Calendar (Scrollable Session Context)
- Container: `div.Qe5W` (overflow-y: auto, scrollHeight ~4054)
- **Scroll via mouse wheel only** — `scrollTop` assignment doesn't work from JS
- Use `page.mouse.wheel(0, 300)` with mouse positioned over the calendar

### Guests
- Button: `button` containing "guests" text (e.g., "4 guests, 1 room")
- Add adult: `[aria-label*="Increase adult"]` or `[aria-label*="Add adult"]`

### Search
- `button[aria-label="Search"]`

## Reading Results

- Hotel cards: class `[class*="hotelCard"]` or `[data-resultid]`
- Prices shown **per night**; multiply by nights for estimated total
- Rating format: `8.4 Very good (1206)` — score out of 10
- Kayak aggregates across booking sites (Booking.com, Hotels.com, etc.)

## Chrome MCP Fallback

When Playwright is CAPTCHA-blocked, navigate to kayak.com/stays in Chrome, fill the form (form preserves previous search), and click Search. Results open in a new tab.
