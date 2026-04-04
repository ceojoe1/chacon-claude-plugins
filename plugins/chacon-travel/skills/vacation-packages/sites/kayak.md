# Kayak Packages — UI Navigation

URL: https://www.kayak.com/packages

## Steps

1. Navigate to the URL. Confirm "Flight + Hotel" is selected.
2. **Origin**: Click the origin field and type the airport code or city (e.g., "ABQ"). Select from dropdown.
3. **Destination**: Click the destination field and type (e.g., "MCO"). Select from dropdown.
4. **Dates**: Click the dates field. Calendar opens — navigate with ">" at approximately (641, 405). Click departure date, then return date.
5. **Travelers**: Click the travelers field. Picker appears inline with "+" at approximately (775, 378). Click once per additional adult. No "Done" button — proceed to Search.
6. Click "Search".

## Reading Results

- Prices are shown **per person** for the combined package. Multiply by traveler count for group total.
- Kayak aggregates across booking sites — note which site is listed for each result.

## Known Behavior

- Like the flights search, Kayak packages may redirect to a partner site (e.g., JustFly, Priceline). Results remain valid.
- **Kayak shows a CAPTCHA iframe on first load** — detected consistently in both Playwright (headless) and has not been tested in headed/Chrome MCP mode yet. If blocked, note "N/A" and continue.
- If Chrome MCP is being used, try navigating to Kayak first then waiting 5s before attempting the form — the CAPTCHA may resolve on its own in a real browser session.
