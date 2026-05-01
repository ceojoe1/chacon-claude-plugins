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

### In progress

- **Google Hotels scraper rewrite** (`hotels/google-hotels.js`) — drilldown flow per `debugging/hotels/google-hotels/google-hotels.md`. Direct `?q=<address>` URL, navigate top 8 hotel cards into detail pages, scrape top 3 cheapest price options per hotel. **Open issue:** the per-night → "Stay Total" dropdown switch isn't firing — the trigger button is not inside `#prices` and isn't matched by aria-haspopup or text heuristics. The user-confirmed XPath for the trigger is:
  ```
  /html/body/c-wiz[2]/div/c-wiz/div[1]/div[2]/div[2]/div[2]/div[2]/c-wiz/div/div/div[2]/span[2]/c-wiz[1]/c-wiz[1]/div/section/div[1]/div[3]/span/span/span
  ```
  The before/after URLs (per-night vs Stay Total) are **identical** — the price-display preference is stored in cookies/localStorage, not the URL. Next session: use the XPath above to click directly, OR set the localStorage key Google uses for price-display.

- **Add Orbitz flight scraper** (`flights/orbitz.js`) — file exists (clone of `expedia.js` with `.com` swap and `[Orbitz]` log labels). First page load works on a fresh session, but subsequent loads hit DataDome ("we can't tell if you're a human") since Expedia Group shares fraud detection across brands. Needs stronger stealth or a real-Chrome path. Already registered in `search.js` flight registry.

### Backlog

- **Fix Southwest flight-row rendering** — the southwest.com scraper hits an XHR-level bot block; flight rows never render. Needs a different approach (Chrome MCP with a real session, or the southwest mobile API).
- **Refactor Expedia (blocked by Akamai)** — partial refactor exists in `flights/expedia.js` (filtered URL, modal tier-pick flow, returning-page scrape) but Akamai's "Access Denied" hits fresh sessions. Needs stronger stealth or a real-Chrome path.
- **Validate bag fees for AA/JetBlue/Alaska/Spirit/Frontier** — `lib/bag-fees.js` defaults to $40 for everything except Southwest ($35), Delta ($45), United ($50). Numbers for the rest should be verified.

## Working Defaults

- Flight default site set: **Expedia, Google Flights, Kayak** (Orbitz registered but blocked).
- Headed multi-site runs auto-tile windows horizontally and zoom page content to fit each tile (`search.js` + `lib/browser.js`). 1440px viewport preserved so sites render desktop layout.
- Process exits cleanly via `process.exit(0)` after `main()` resolves.
- Kayak filter chain (post-loosening): `cabin=-f;stops=-2;hidebasic=hidebasic` with `sort=bestflight_a`. Removed prior airline exclusions (`-AS,B6`) and bag-required filters (`bfc=1;cfc=1`) that limited results to Southwest only.
- Google Flights drilldown: clicks the time-text element on each Top Departing card (avoids CO2 popup buttons), `page.goto(searchUrl)` between cards (more reliable than `goBack()`), retry-once on 0-return cards.
