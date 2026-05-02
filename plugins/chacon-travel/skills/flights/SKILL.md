---
name: flights
description: Search travel sites for flights and return a cost comparison summary. Use when the user wants to find flights, compare airfares, or look up flight prices between two cities.
---

Search travel sites for flights and present a cost comparison.

## Step 1 — Resolve trip parameters

Call `mcp__chacon-travel-db__get_trips` to list saved trips.

- If trips are returned, use AskUserQuestion to ask which trip to search (one option per trip, label format: `<name> — <origin> → <destination>, <depart> to <return>`) plus a "New trip" option.
- If the user picks a saved trip, pull origin/destination/depart/return/travelers from its row — skip those questions.
- If "New trip" or no saved trips, prompt for missing fields via AskUserQuestion:
  - **Origin** (city or airport code, e.g. "ABQ", "Albuquerque, NM")
  - **Destination** (city or airport code)
  - **Departure date** (YYYY-MM-DD)
  - **Return date** (YYYY-MM-DD)
  - **Number of travelers** (default 1)
  - **Trip label** — optional, only ask if the user wants to bookmark this for re-runs

## Step 2 — Run the search

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" flights \
  --origin "<ORIGIN>" --destination "<DESTINATION>" \
  --depart <YYYY-MM-DD> --return <YYYY-MM-DD> \
  --travelers <N> \
  [--trip "<TRIP LABEL>"]
```

Wait for the command to finish. Default site set: Expedia, Google Flights, Kayak. Results write directly to SQLite.

## Step 3 — Summarize the results

Query the DB for the freshly written snapshot:

- Call `mcp__chacon-travel-db__get_best_fares` with the destination slug to get the cheapest option.
- Call `mcp__chacon-travel-db__get_price_history` with `category="flights"` and the slug for the full row set.

Render a concise summary table (top 5-8 options sorted by Total Cost ascending):

| Site | Airline | Departure | Return | Stops | Per Person | Total |
|---|---|---|---|---|---|---|
| Google Flights | United | 8:15 AM | 4:30 PM | 0 / 0 | $312 | $312 |

If multiple snapshots exist for this trip+category in the price history, surface the price-drift highlight:
> "Cheapest flight dropped from $345 → $312 since last search on 2026-04-28."

If a site returned an error (CAPTCHA, blocked, parse failure), mention it briefly without dwelling — these are common and not fatal.

## Step 4 — Offer follow-ups

- If this was a new trip and the user gave a label, mention it's been saved and they can re-run with `/trip-rerun "<label>"`.
- If `--export` wasn't used, mention the user can re-run with `--export` to get .md/.csv files alongside the DB.
