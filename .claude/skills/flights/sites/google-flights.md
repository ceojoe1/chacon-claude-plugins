# Google Flights — UI Navigation

URL: https://www.google.com/travel/flights

## Steps (Chrome MCP)

1. Create a new tab with `tabs_create_mcp`, then navigate to the URL.
2. Read the page with `read_page` (`filter: "interactive"`) to get ref IDs.
3. **Passengers**: Click the passenger button (`[aria-label*="passenger"]`). In the picker, click `[aria-label="Add adult"]` once per additional adult. Click "Done" (`[jsname="McfNlf"]`) to close.
4. **Origin**: Click the `[aria-label="Where from?"]` combobox. A dialog opens with its own origin input. Type the origin city/airport. Select the first autocomplete option. The dialog closes automatically after selection.
5. **Destination**: Click the `[placeholder="Where to?"]` combobox (not the one inside the origin dialog). Type the destination. Select from autocomplete.
6. **Dates**: Click `[aria-label="Departure"]` to open the calendar. Calendar day cells use `[data-iso="YYYY-MM-DD"]` — click the target day directly. Navigate forward with `[aria-label="Next"]` button. After selecting departure, click the return date the same way. Click "Done" to confirm.
7. Click `[aria-label="Search"]`.

## Reading Results

- **Prices shown are the total for all passengers combined** — divide by traveler count to get per-person price.
- "Top departing flights" = best-ranked options. "Other departing flights" (below) may include cheaper fares.
- The "Cheapest from $X" tab at the top shows the lowest available fare.
- Each result card format: `H:MM AM – H:MM PM AIRLINE X hr Y min ORIGIN–DEST N stop ... $TOTAL round trip`

## Playwright DOM Notes

- Origin field: `[aria-label="Where from?"]` — clicking it opens a dialog overlay; the "Where to?" field becomes hidden until the dialog closes
- After origin autocomplete, press Escape then check visibility of `[placeholder="Where to?"]`; fall back to Tab if not visible
- Departure date field: `INPUT[type=text][aria-label="Departure"]` — use calendar click approach, NOT `keyboard.type()`
- Calendar day cells: `[data-iso="YYYY-MM-DD"]` DIV elements
- Calendar "Next" button: `[aria-label="Next"]`
- Passenger count "Add adult": `[aria-label="Add adult"]` with `jsname="TdyTDe"`
- Passenger count "Done": `jsname="McfNlf"` (text "Done", no aria-label on button)
- Price elements on results page: find `*` with text matching `/^\$[\d,]{2,7}$/`, then walk up 8 levels to find ancestor with AM/PM time — that's the flight card
- Results page prices ARE the total for all passengers (confirmed: "Prices include required taxes + fees for N adults")
