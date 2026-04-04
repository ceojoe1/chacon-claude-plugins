# Costco Travel Hotels — UI Navigation

URL: https://www.costcotravel.com/Hotels

## Steps

1. Navigate to the URL.
2. **Destination**: Click the destination field and type the city or hotel name. Select from dropdown.
3. **Dates**: Click the check-in date field and select from the calendar; repeat for check-out.
4. **Rooms/Guests**: Set room count and guests per room using the dropdowns or fields provided.
5. Click "Search".

## Reading Results

- Prices are shown **per night** — multiply by nights for total stay cost.
- Costco Travel often includes added value (gift cards, credits) — note any extras listed.
- A Costco membership is required to book but not to browse prices.

## Known Behavior (observed 2026-04-04)

- Form fills correctly: destination autocomplete shows "Orlando, Florida, United States of America" as first option
- Dates are text inputs with `id="checkInDateWidget"` and `id="checkOutDateWidget"` — set via JS: `element.value = '07/10/2026'` + `dispatchEvent(new Event('change', {bubbles: true}))`
- Adults set via `id="hotelAdultsInRoomForWidget_1"` select element
- Search button triggers AJAX load (spinner), results render on same page
- **Chrome MCP screenshot/get_page_text is BLOCKED on costcotravel.com** — extension does not have permission to access the host
- Workaround: Use Playwright headless with retry, or skip Costco if blocked
