# Expedia — UI Navigation

URL: https://www.expedia.com/Flights

## Steps

1. Navigate to the URL. Confirm "Round trip" is selected (toggle if needed).
2. Click "Leaving from" and type the origin city or airport code.
3. Click "Going to" and type the destination city or airport code.
4. **Dates**: Click the dates field. A two-month calendar opens. Navigate forward with the ">" arrow at approximately (1171, 245) — one click per month. Click departure date, then return date, then "Done".
5. **Travelers**: Click the "Travelers, Cabin class" field. A picker opens with "+" buttons for Adults (~993, 265). Click "+" once per additional adult needed (e.g., 3 clicks for 1 → 4), then click "Done". **Faster alternative**: use `javascript_tool` to set the count directly.
6. Click "Search".

## Reading Results

- Prices are typically shown **per person round-trip** — multiply by traveler count for the group total.
- Filter by "Nonstop" or sort by "Price" to find the best fare quickly.
- Note the airline shown for each result, as Expedia aggregates multiple carriers.
