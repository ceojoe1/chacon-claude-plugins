# VRBO — UI Navigation

URL: https://www.vrbo.com

## Steps

1. Navigate to the URL.
2. **Destination**: Click the search/destination field and type the city or area. Select from dropdown.
3. **Dates**: Click the check-in date and select from the calendar; repeat for check-out.
4. **Guests**: Click the guests field and set the total guest count using "+" buttons or a dropdown.
5. Click "Search".

## Reading Results

- Prices are shown **per night** (sometimes as a total with nightly average noted). Multiply by nights for total.
- VRBO shows entire-home vacation rentals only — no hotel rooms.
- Filter by beds/baths to match group size. Look for "Free cancellation" listings for flexibility.
- Note the nightly rate vs. total (which includes cleaning fees and service fees).

## Known Behavior (observed 2026-04-04)

- Direct URL with dates works: `vrbo.com/search?destination=Orlando%2C+Florida%2C+United+States+of+America&regionId=2693&d1=2026-07-10&startDate=2026-07-10&d2=2026-07-17&endDate=2026-07-17&adults=4&sort=RECOMMENDED`
- Homepage pre-fills from previous session (shows "Your recent searches")
- Dates field must include both `d1`/`startDate` and `d2`/`endDate` params for date-specific pricing
- Results show: property name, type, sleeps/bedrooms/bathrooms, rating/10, avg per night, and **total for the stay including all fees**
- `get_page_text` does not work reliably on VRBO — use `javascript_tool` with `document.body.innerText` instead
- 300+ properties returned for Orlando; scroll or paginate to see more
- Results may not always include check-in/check-out dates from URL params if `regionId` differs; verify "Dates" field shows correct dates in body text before reading prices
