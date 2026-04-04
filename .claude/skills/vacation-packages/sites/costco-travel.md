# Costco Travel Vacation Packages — UI Navigation

URL: https://www.costcotravel.com/Vacation-Packages

## Key Notes

- **Navigate to the homepage (`costcotravel.com`) not the `/Vacation-Packages` path** — the `/Vacation-Packages` path redirects to a destination browse page with a nav that intercepts clicks. The homepage loads the search form directly with the Packages tab active.
- **Destination auto-completes** as you type — typing "Orlando" shows "Orlando, Florida, United States of America" as the first dropdown option. Click it directly.
- **Do NOT click the nav bar while the form is open** — hovering over "Cruises" or other nav items opens a full-page flyout menu that hides the form. If this happens, click the Costco Travel logo to return to the homepage.
- **Adults dropdown is a `<select>` element** — use `javascript_tool` to set it directly (faster and more reliable than clicking):
  ```js
  const s = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === '4') && Array.from(s.options).some(o => o.value === '1'));
  s.value = '4'; s.dispatchEvent(new Event('change', {bubbles: true}));
  ```
- **Flying From**: type airport code (e.g., `ABQ`) — autocomplete shows "(ABQ) Albuquerque International, New Mexico, United States..." as first option; click it.
- **Results page renders blank visually** in Chrome MCP screenshots — use `javascript_tool` to extract data from the DOM directly (the data is present, just not painting).
- Date fields accept `MM/DD/YYYY` typed directly after clicking.
- Results load on the same page. Page title changes to "Search Results - Packages".

## Steps

1. Navigate to `https://www.costcotravel.com/` (homepage, NOT `/Vacation-Packages`). Confirm "Packages" tab is active.
2. **Destination**: `left_click` on "Airport, City or Zip Code" field, type destination (e.g., `Orlando`) — click "Orlando, Florida, United States of America" from dropdown.
3. **Departure date**: `left_click` on the departure date field, type `MM/DD/YYYY`.
4. **Return date**: `left_click` on the return date field, type `MM/DD/YYYY`.
5. **Adults**: Use `javascript_tool` to set the Adults `<select>` value to the desired count (e.g., `4`). See snippet above.
6. **Flying From**: `left_click` on field, type `ABQ`, wait ~1s, click "(ABQ) Albuquerque International" from dropdown.
7. Click "Search" button.

## Reading Results

- Prices shown as **per traveler** — multiply by traveler count for group total.
- Use `javascript_tool` to extract results since the page may render blank visually:
  ```js
  const allText = document.body.innerText;
  const lines = allText.split('\n').map(l => l.trim()).filter(l => l);
  // Parse "Orlando: [hotel name]" blocks followed by "$X,XXX.XX" price lines
  ```
- "Costco Recommends" badge = highest-rated/best-value properties.
- Packages often include bonus extras: Disney park tickets, daily breakfast, waived resort fees, free parking — check `perks` in the extracted data.
- A Costco membership is required to book but NOT required to browse prices.
