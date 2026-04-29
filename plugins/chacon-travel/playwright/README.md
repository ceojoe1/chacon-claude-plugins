# Playwright Travel Scrapers

Headless flight/hotel/vacation-package scrapers used by the `chacon-travel` skill. Results are written to `travel_plans/<destination-slug>/<category>/processed=<YYYY-MM-DD>/results.md` and `summary.md` is updated automatically.

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

## Output schema

Each row in `results.md` has these columns:

```
| Site | Airline | Departure → Return | Stops | Includes | Per Person | Total (Group) |
```

The **Includes** column shows what the fare bundles (e.g. `Carry-on, Seat`, `Personal item only (Basic)`, `Carry-on, 2 bags` for Southwest). It's a heuristic based on visible card text — when a site doesn't surface the fare-class label in the card (e.g. Google Flights' default layout), it falls back to `Carry-on, Seat`, which may misclassify Basic Economy fares as standard.

## Other useful flags

| Flag           | Purpose                                                                                  |
|----------------|------------------------------------------------------------------------------------------|
| `--headed`     | Show the browser window (needed to manually solve CAPTCHAs)                              |
| `--no-parallel`| Run sites sequentially (useful when debugging a specific scraper)                        |
| `--timeout`    | Per-site timeout in ms (default 60000)                                                   |
| `--pause N`    | Keep the browser open N seconds after the search (implies `--headed`)                    |
| `--slug`       | Override the destination folder slug (e.g. `--slug san-francisco-ca`)                    |
