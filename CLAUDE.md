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

- Southwest Vacations (swavacations.com)
- Costco Travel (costcotravel.com)
- Expedia (expedia.com)
- Kayak (kayak.com)
- Google Flights / Google Hotels
- Southwest Airlines (southwest.com)
- VRBO (vrbo.com)
- Airbnb (airbnb.com)

## Results Storage

Every skill run appends results to `travel_plans/[destination]/results.md`. Each destination gets its own folder, making it easy to compare prices for the same trip over time.

Example structure:
```
travel_plans/
  san-diego-ca/
    results.md   ← all searches for San Diego
  maui-hi/
    results.md   ← all searches for Maui
```

Each entry in `results.md` includes:
- Date/time of the search
- All input parameters (so searches can be re-run exactly)
- The full results table

Appending new rows on each run lets you track price changes over time.
