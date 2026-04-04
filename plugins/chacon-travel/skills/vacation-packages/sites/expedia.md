# Expedia Vacation Packages — UI Navigation

URL: https://www.expedia.com/Vacation-Packages

## Steps

1. Navigate to the URL. Confirm "Bundle & Save" or "Flight + Hotel" mode is active.
2. **Origin**: Click "Leaving from" and type the departure city/airport code. Select from dropdown.
3. **Destination**: Click "Going to" and type the destination. Select from dropdown.
4. **Dates**: Click the dates field. Calendar opens — navigate with ">" at approximately (1171, 245). Click departure, then return date, then "Done".
5. **Travelers**: Click the travelers field. Picker opens with "+" for Adults (~993, 265). Click once per additional adult (e.g., 3 clicks for 1 → 4). Click "Done". **Faster alternative**: use `javascript_tool` to set directly.
6. Click "Search".

## Reading Results

- Prices are shown as **total package per person** or as a combined total — read the label carefully.
- Expedia often shows savings vs. booking separately — note the "Save $X" callout.
- Filter by hotel star rating or guest rating to narrow results.

## Known Behavior

- **DataDome anti-bot blocks Expedia** — even in the user's real Chrome browser, navigating directly to Expedia Vacation Packages triggers a "Bot or Not?" DataDome challenge page. This occurs in both Playwright (headless) and Chrome MCP sessions.
- Mark as N/A when this happens. If the user has an established Expedia session with browsing history, they may be able to manually navigate and share results.
