# Kayak — UI Navigation

URL: https://www.kayak.com/flights

## Steps

1. Navigate to the URL. Confirm "Round-trip" is selected.
2. Click the origin field and type the airport code or city (e.g., "ABQ").
3. Click the destination field and type the airport code or city (e.g., "MCO").
4. **Dates**: Click the Departure field. A calendar opens showing two months. Navigate with ">" at approximately (641, 405) — one click per month. Click departure date, then return date. The picker stays open; the travelers picker opens automatically after dates are set.
5. **Travelers**: A picker appears inline showing Adults (+/- buttons at ~775, 378). Click "+" once per additional adult (e.g., 3 clicks for 1 → 4). No "Done" button — just click "Search" directly.
6. Click "Search".

## Reading Results

- Prices are typically shown **per person round-trip** — multiply by traveler count for the group total.
- Kayak aggregates multiple airlines — note the airline listed for each result.
- Use the "Cheapest" sort to surface the lowest fare quickly. Kayak may show a CAPTCHA on first load — if so, note "N/A" and continue.

## Known Behavior
- The homepage shows a "Compare vs. KAYAK / JustFly" checkbox checked by default. Clicking Search may redirect to **JustFly** (a Kayak partner) — this is expected. Results are still valid for your search.
- On JustFly, prices are labeled "total per passenger" (per person round-trip). Multiply by traveler count for group total.
- Clicking the travelers field opens a picker inline — set Adults, then click Search (no separate "Done" button needed).
