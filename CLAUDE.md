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

- **Expand hotels results schema** — add columns: Trip (CLI `--trip` flag), Search, Distance from destination (scrape from SERP card text), Check-in Date, Check-in Time (default 3PM), Check-out Date, Check-out Time (default 11AM), Per Night, Total, Fees (col2 - col1 from triple-price pattern × nights), Source. See `debugging/hotels/google-hotels/google-hotels.md` for the triple-price structure.

- **Add Orbitz flight scraper** (`flights/orbitz.js`) — file exists (clone of `expedia.js` with `.com` swap and `[Orbitz]` log labels). First page load works on a fresh session, but subsequent loads hit DataDome ("we can't tell if you're a human") since Expedia Group shares fraud detection across brands. Needs stronger stealth or a real-Chrome path. Already registered in `search.js` flight registry.

### Backlog

- **Fix Southwest flight-row rendering** — the southwest.com scraper hits an XHR-level bot block; flight rows never render. Needs a different approach (Chrome MCP with a real session, or the southwest mobile API).
- **Refactor Expedia flights (blocked by Akamai)** — partial refactor exists in `flights/expedia.js` (filtered URL, modal tier-pick flow, returning-page scrape) but Akamai's "Access Denied" hits fresh sessions. Needs stronger stealth or a real-Chrome path.
- **Re-enable disabled hotel scrapers** — `hotels/expedia.js`, `hotels/costco-travel.js`, `hotels/vrbo.js` were commented out of the registry in v2.0.1 because they returned 0 results in the Orlando smoke test. Likely causes: Akamai (Expedia), DOM drift (Costco Travel), CAPTCHA (VRBO). Diagnose each, fix, re-add to `playwright/search.js` hotels registry.

- **Schedule Dependabot triage routine** — set up a recurring remote agent (via `/schedule`) that runs every Monday at 9 AM America/Denver (cron `0 15 * * 1` UTC) on `ceojoe1/chacon-claude-plugins`. Behavior: list open Dependabot PRs, auto-merge patch/minor bumps with green CI (`gh pr merge <N> --squash --delete-branch`), comment on major bumps with upstream changelog link for human review, post `@dependabot recreate` on PRs with red CI. End with one-line summary `merged: N, commented: N, recreated: N, skipped: N`. **Blocker:** GitHub isn't connected for this repo on the routines side — run `/web-setup` (or install the Claude GitHub App at https://claude.ai/code/onboarding?magic=github-app-setup) before creating the routine, otherwise the agent can't do anything.

## Working Defaults

- Flight default site set: **Expedia, Google Flights, Kayak** (Orbitz registered but blocked).
- Headed multi-site runs auto-tile windows horizontally and zoom page content to fit each tile (`search.js` + `lib/browser.js`). 1440px viewport preserved so sites render desktop layout.
- Process exits cleanly via `process.exit(0)` after `main()` resolves.
- Kayak filter chain (post-loosening): `cabin=-f;stops=-2;hidebasic=hidebasic` with `sort=bestflight_a`. Removed prior airline exclusions (`-AS,B6`) and bag-required filters (`bfc=1;cfc=1`) that limited results to Southwest only.
- Google Flights drilldown: clicks the time-text element on each Top Departing card (avoids CO2 popup buttons), `page.goto(searchUrl)` between cards (more reliable than `goBack()`), retry-once on 0-return cards.
- Google Hotels: drills top 3 hotel detail pages via card `<a href>`. The DOM contains all three price formats per row simultaneously (`$nightly_base $nightly_with_fees $stay_total Visit site`) — extract stay total directly with the triple-dollar regex; the "Stay total" dropdown is purely visual and never needs to be opened. Use `document.querySelectorAll('#prices')[1]` (Google emits two `#prices` — index 0 is the heading, index 1 is the data). Per-site timeout should be `≥ 240000ms` for 3-hotel runs.
