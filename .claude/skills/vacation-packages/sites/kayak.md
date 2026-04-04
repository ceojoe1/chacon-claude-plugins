# Kayak Packages — UI Navigation

URL: https://www.kayak.com/packages

## Steps

1. Navigate to the URL. Confirm "Flight + Hotel" is selected.
2. **Origin**: Click the origin field and type the airport code or city (e.g., "ABQ"). Select from dropdown.
3. **Destination**: Click the destination field and type (e.g., "MCO"). Select from dropdown.
4. **Dates**: Click the dates field. Calendar opens — navigate with ">" at approximately (641, 405). Click departure date, then return date.
5. **Travelers**: Click the travelers field. Picker appears inline with "+" at approximately (775, 378). Click once per additional adult. No "Done" button — proceed to Search.
6. Click "Search".

## Reading Results

- Prices are shown **per person** for the combined package. Multiply by traveler count for group total.
- Kayak aggregates across booking sites — note which site is listed for each result.

## Known Behavior

- Like the flights search, Kayak packages may redirect to a partner site (e.g., JustFly, Priceline). Results remain valid.
- **Playwright (headless): CAPTCHA blocked** — Kayak shows a CAPTCHA iframe in headless mode consistently.
- **Chrome MCP: No CAPTCHA observed (2026-04-04)** — In a real Chrome session with browsing history, Kayak packages loaded without CAPTCHA. The form auto-pre-filled from the previous search session (origin, destination, dates, traveler count all remembered). A "Hey friend" sign-in modal appeared — close it with the X and proceed.
- **Kayak opens an Expedia tab in the background** when search is submitted — this tab contains Expedia package hotel results that bypass DataDome. Capture data from both the Kayak results tab and the Expedia background tab.
- Results are booked via Priceline. Prices shown are total group price with per-person below.
- Sign-in modal can appear on page load — dismiss with the X button (top-right of modal).
