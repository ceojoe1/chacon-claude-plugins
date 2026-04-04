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
3. **Depart date**: `triple_click` the depart date field, then type `MM/DD/YYYY` (e.g., `07/10/2026`). A calendar picker opens — click the date to confirm, which also opens the return date picker.
4. **Return date**: After depart is selected, type `MM/DD/YYYY` into the return date field (`triple_click` ref first). The calendar will show both dates highlighted. Press Escape to close the calendar.
5. **Passengers**: Click the passengers combobox (ref: `combobox "Passenger Selector"`). The picker modal opens with spinbuttons. Use `button[aria-label="inc"]` (first one = Adults) via JavaScript `document.querySelectorAll('button[aria-label="inc"]')[0].click()` to increment, or `button[aria-label="dec"]` to decrement. Then find and click the Apply button with JavaScript: `document.querySelector('button').textContent === 'Apply'`.
6. **Search flights**: Do NOT use `button[type="submit"].click()` from the homepage — it may intercept to another site. Instead, navigate directly to the booking page URL OR use the standalone `/air/booking/` page and click the yellow "Search flights" button by coordinate (center of button).
7. **Better approach**: Navigate directly to results URL: `https://www.southwest.com/air/booking/select.html?adultPassengersCount=4&departureDate=YYYY-MM-DD&destinationAirportCode=MCO&fareType=USD&originationAirportCode=ABQ&returnDate=YYYY-MM-DD&tripType=roundtrip` — this reliably loads the flight selection page.

## Known Issues (discovered 2026-04-04)
- The homepage widget has background link overlays that intercept clicks meant for "Search flights" and redirect to Vrbo/other partner sites. Avoid clicking the submit button on the homepage.
- The `triple_click` + type approach for return date may not work on the homepage widget — use `ref_click` on the textbox ref then type the date.
- Clicking passenger `+` buttons by coordinate is unreliable due to overlapping links. Use JavaScript `.click()` on `button[aria-label="inc"]`/`button[aria-label="dec"]` instead.
- After filling the form on `/air/booking/`, the standalone page does NOT have the overlay issue — "Search flights" click works reliably there.

## Reading Results

- Prices are shown **per person one-way** — multiply by 2 for round-trip per person, then by traveler count for group total.
- The page shows departing flights first. Note the cheapest and best-value fare (lowest stops, reasonable duration).
- "Go for Less / Basic" is the cheapest tier (seat assigned at check-in); "Top Pick / Choice" adds standard seat selection.
- Southwest does not appear on most third-party sites, so checking directly is important.
- No need to click through to the return leg — just record the best one-way fare and note it as estimated RT (×2).
