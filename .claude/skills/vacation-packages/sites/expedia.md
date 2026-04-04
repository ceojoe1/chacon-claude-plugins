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

- **DataDome anti-bot blocks Expedia on direct navigation** — navigating directly to Expedia Vacation Packages triggers a "Bot or Not?" DataDome challenge page. This occurs in both Playwright (headless) and Chrome MCP direct sessions.
- **Kayak referral bypass (discovered 2026-04-04)** — When Kayak's packages search is run, it opens an Expedia tab in the background with a `misId` referral token in the URL. This tab loads Expedia hotel-select results for the package (flight already selected by Kayak) and is NOT blocked by DataDome. Use this tab to extract Expedia package prices.
  - The Expedia tab URL contains `?misId=...&packageType=fh&searchProduct=hotel&adults=N&...` parameters
  - Results show per-traveler price with "includes flight + stay" and total package price
  - 483+ properties loaded in testing with full pricing
- Mark as N/A only if neither direct nav nor Kayak referral produces results.
