# Playwright Travel Scrapers

Headless flight/hotel/vacation-package scrapers used by the `chacon-travel` skill. Results are appended to a single persistent file at `travel_plans/<destination-slug>/<category>/results.md` (and `results.csv` for spreadsheets); `summary.md` is updated automatically. Every run appends rows tagged with a `Processed Timestamp` column so you can track price drift over time.

## Setup

```powershell
Set-Location playwright; npm install
```

> Note: Windows PowerShell 5.1 does not support `&&` for command chaining — use `;` instead. Skip the `cd` if you'll run `node playwright/search.js ...` from the repo root.

## Run all flight sites in parallel (default)

```powershell
node playwright/search.js flights `
  --origin "Albuquerque, NM" `
  --destination "San Francisco, CA" `
  --depart 2026-06-14 `
  --return 2026-06-18 `
  --travelers 1
```

> The backtick (`` ` ``) is PowerShell's line-continuation character. The closing backtick must be the very last character on the line — no trailing spaces.

## Run a single flight site (headless)

Use `--sites <name>` (case-insensitive substring match against the site's display name).

| Site            | Command                                                                                                                                                          |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Google Flights  | `node playwright/search.js flights --origin "Albuquerque, NM" --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Google Flights"` |
| Southwest       | `node playwright/search.js flights --origin "Albuquerque, NM" --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Southwest"`      |
| Expedia         | `node playwright/search.js flights --origin "Albuquerque, NM" --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Expedia"`        |
| Kayak           | `node playwright/search.js flights --origin "ABQ" --destination "SFO" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Kayak"`                                   |
| United          | `node playwright/search.js flights --origin "ABQ" --destination "SFO" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "United"`                                  |

### Notes

- **Kayak** and **United** use direct URLs and prefer 3-letter IATA codes (e.g. `ABQ`, `SFO`). City names work for the other sites via autocomplete form-fill.
- **United, Kayak, Expedia** are aggressive with bot detection. If headless returns `CAPTCHA: ...`, retry with `--headed` to solve manually:
  ```powershell
  node playwright/search.js flights --origin ABQ --destination SFO --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "United" --headed
  ```
- Run multiple sites by comma-separating: `--sites "Google Flights,Kayak"`.

## Run all hotel sites in parallel (default)

```powershell
node playwright/search.js hotels `
  --destination "San Francisco, CA" `
  --depart 2026-06-14 `
  --return 2026-06-18 `
  --travelers 1 `
  --rooms 1
```

> Hotels don't take `--origin` (you're searching where to stay, not where to fly from). `--rooms` defaults to `1`; pass it explicitly if you need more.

## Run a single hotel site (headless)

| Site            | Command                                                                                                                                                |
|-----------------|--------------------------------------------------------------------------------------------------------------------------------------------------------|
| Google Hotels   | `node playwright/search.js hotels --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Google Hotels"`     |
| Expedia         | `node playwright/search.js hotels --destination "San Francisco near Moscone Center" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Expedia"`           |
| Kayak           | `node playwright/search.js hotels --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Kayak"`             |
| Costco Travel   | `node playwright/search.js hotels --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Costco Travel"`     |
| VRBO            | `node playwright/search.js hotels --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "VRBO"`              |
| Airbnb          | `node playwright/search.js hotels --destination "San Francisco, CA" --depart 2026-06-14 --return 2026-06-18 --travelers 1 --sites "Airbnb"`            |

### Search by specific hotel name

Pass the property name as `--destination` to anchor the search on that hotel — most sites (Expedia, Kayak, Google Hotels) treat it as a property lookup and surface that hotel as the top result. Use `--slug` to keep multiple per-property searches under the same destination folder so they accumulate in one `results.md`:

```powershell
node playwright/search.js hotels --destination "Hilton San Francisco Union Square" `
  --depart 2026-06-14 --return 2026-06-18 --travelers 6 --rooms 6 `
  --slug san-francisco-ca --sites "Google Hotels,Expedia,Kayak"
```

### Hotel notes

- **Costco Travel** requires a Costco membership for full pricing — results may be limited or zero without an authenticated session. Run with `--headed` and sign in manually if you want member rates.
- **VRBO** and **Airbnb** are vacation-rental platforms; their results show whole properties (per-night) rather than hotel rooms, so the "Per Night" column means "per property" for those sites.
- **Google Hotels** can land on a property's *detail* page when given a specific hotel name, where the H1 heading sometimes intercepts clicks on the Check-in field. Retry with a more generic destination ("San Francisco, CA") or use `--headed` to interact manually.
- **Expedia** rate-limits aggressively across consecutive runs — if you see `CAPTCHA: we can't tell if you're a human` (DataDome), wait a few minutes before the next search.
- Same `--headed` retry pattern as flights applies if a site returns `CAPTCHA: ...` or `No results found`.

## Output schema

### Flights

Each run appends rows to a single flat table in `results.md` (and the matching CSV). Columns:

```
| Processed Timestamp | Origin | Destination | Travelers | Site | Airline |
| Departure Date | Return Date | Departure Times | Return Times |
| Stops (out/ret) | Round Trip Cost | Extra Costs (out/ret) | Total Cost | Amenities |
```

- **Round Trip Cost** is the base airfare × travelers; **Extra Costs (out/ret)** layers per-direction checked-bag fees from `lib/bag-fees.js` (Southwest=$35, Delta=$45, United=$50, default=$40). **Total Cost** is the sum.
- **Amenities** is a heuristic on the fare's bundle (e.g. `Carry-on, Seat`, `Personal item only (Basic)`, `Carry-on, 2 bags` for Southwest). When a site doesn't surface the fare-class label, it falls back to `Standard? (verify on site)` rather than asserting amenities the fare may not include.

### Hotels

```
| Property | Type | Rating | Per Night | Total Stay | Notes |
```

- **Type** — e.g. `Hotel`, `Apartment`, `Entire home` (vacation rentals)
- **Rating** — star rating or guest review average if shown by the site
- **Per Night** / **Total Stay** — rate × number of nights, multiplied by `--rooms` for the group total when applicable

## Other useful flags

| Flag           | Purpose                                                                                  |
|----------------|------------------------------------------------------------------------------------------|
| `--headed`     | Show the browser window (needed to manually solve CAPTCHAs). When combined with multi-site parallel runs, browser windows auto-tile horizontally and the page content is zoomed to fit each tile. |
| `--no-parallel`| Run sites sequentially (useful when debugging a specific scraper)                        |
| `--timeout`    | Per-site timeout in ms (default 60000)                                                   |
| `--pause N`    | Keep the browser open N seconds after the search (implies `--headed`)                    |
| `--slug`       | Override the destination folder slug (e.g. `--slug san-francisco-ca`)                    |
