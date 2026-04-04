# Southwest Airlines — UI Navigation

URL: https://www.southwest.com

## Key Notes (saves steps)

- **Use airport codes, not city names** — type `MCO` in the Arrive field, not "Orlando". "Orlando" triggers no autocomplete; "MCO" shows the dropdown immediately.
- The **Depart field is pre-filled** with ABQ if the user is in Albuquerque — skip it and go straight to Arrive.
- The `form_input` tool does NOT work for the Arrive combobox — use `computer(left_click)` on the field, then `computer(type "MCO")`, then click the dropdown option.
- Date fields accept `MM/DD/YYYY` typed directly after a triple-click — no calendar navigation needed.
- Typing a passenger count opens a picker modal automatically — click Apply to confirm.

## Steps

1. Navigate to the URL. The Depart field auto-fills ABQ — verify and skip if correct.
2. **Arrive field**: `left_click` on it, type the IATA code (e.g., `MCO`), wait ~1s, then click the dropdown option (e.g., "Orlando, FL - MCO").
3. **Depart date**: `triple_click` the depart date field, then type `MM/DD/YYYY` (e.g., `07/10/2026`).
4. **Return date**: `triple_click` the return date field, then type `MM/DD/YYYY` (e.g., `07/17/2026`).
5. **Passengers**: `triple_click` the passengers field and type the count (e.g., `4`). A picker modal opens — verify Adults is correct, then click "Apply".
6. Click "Search flights" and wait for results to load.

## Reading Results

- Prices are shown **per person one-way** — multiply by 2 for round-trip per person, then by traveler count for group total.
- The page shows departing flights first. Note the cheapest and best-value fare (lowest stops, reasonable duration).
- "Go for Less / Basic" is the cheapest tier (seat assigned at check-in); "Top Pick / Choice" adds standard seat selection.
- Southwest does not appear on most third-party sites, so checking directly is important.
- No need to click through to the return leg — just record the best one-way fare and note it as estimated RT (×2).
