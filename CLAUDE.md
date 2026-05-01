# vacAI — Vacation Cost Estimator

A Claude Code project that uses browser automation (Claude-in-Chrome) to search real travel sites and return cost estimates for vacations.

## Skills

| Command | Description |
|---|---|
| `/vacation-packages` | Search for bundled flight + hotel packages |
| `/flights` | Search for flights only |
| `/hotels` | Search for hotels and vacation rentals only |

## Required Inputs

Each skill will prompt you for any missing details:

- **Destination** — city, neighborhood, or property name
- **Origin city** — where you're flying from (flights/packages)
- **Check-in / Departure date** — YYYY-MM-DD format
- **Check-out / Return date** — YYYY-MM-DD format
- **Number of travelers** — total guests
- **Number of rooms** — for hotel searches

## Travel Sites Searched

**Default flight set:** Expedia, Google Flights, Kayak.

Additional / category-specific sources:
- Southwest Vacations (swavacations.com)
- Costco Travel (costcotravel.com)
- Southwest Airlines (southwest.com)
- VRBO (vrbo.com)
- Airbnb (airbnb.com)
- United (united.com)

## Results Storage

Every skill run appends rows to a single persistent file per destination/category at `travel_plans/[destination]/[category]/results.md` (and a sibling `results.csv` for spreadsheets). No date-bucketed subfolders — runs accumulate over time so price drift is visible in one table.

Each row carries a `Processed Timestamp` column so you can tell when each price snapshot was captured.

```
travel_plans/
  san-francisco-ca/
    flights/
      results.md   ← all flight searches for SF (every run appends rows)
      results.csv
    hotels/
      results.md
```

## Open Follow-up Tasks

Things to circle back to in future sessions (kept here so context survives `/clear`):

- **Add Orbitz flight scraper** — extend the default flight set to include Orbitz alongside Expedia, Google Flights, Kayak.
- **Fix Southwest flight-row rendering** — the southwest.com scraper hits an XHR-level bot block; flight rows never render. Needs a different approach (Chrome MCP with a real session, or the southwest mobile API).
- **Refactor Expedia (blocked by Akamai)** — partial refactor exists in `flights/expedia.js` (filtered URL, modal tier-pick flow, returning-page scrape) but Akamai's "Access Denied" hits fresh sessions. Needs stronger stealth or a real-Chrome path.
- **Validate bag fees for AA/JetBlue/Alaska/Spirit/Frontier** — `lib/bag-fees.js` defaults to $40 for everything except Southwest ($35), Delta ($45), United ($50). Numbers for the rest should be verified.
