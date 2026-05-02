---
name: vacation-packages
description: Search for bundled flight + hotel vacation packages and return a cost summary. Use when the user wants to find vacation packages, travel bundles, or combined flight and hotel deals.
---

Search travel sites for bundled flight + hotel vacation packages and present a cost comparison.

## Step 1 — Resolve trip parameters

Call `mcp__chacon-travel-db__get_trips` to list saved trips.

- If trips are returned, use AskUserQuestion to ask which trip to search plus a "New trip" option.
- If the user picks a saved trip, pull origin/destination/depart/return/travelers from its row.
- If "New trip" or no saved trips, prompt via AskUserQuestion for:
  - **Origin** (city or airport code)
  - **Destination** (city, region, or resort area)
  - **Departure date** (YYYY-MM-DD)
  - **Return date** (YYYY-MM-DD)
  - **Number of travelers** (default 1)
  - **Trip label** — optional, only ask if the user wants to bookmark this

## Step 2 — Run the search

Vacation-package searches typically take 3-6 minutes. Run in background and stream progress:

1. Tell the user: "Package searches across all sites typically take a few minutes. I'll surface progress as each site reports in."
2. Run the Bash command with `run_in_background: true`:
   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" vacation-packages \
     --origin "<ORIGIN>" --destination "<DESTINATION>" \
     --depart <YYYY-MM-DD> --return <YYYY-MM-DD> \
     --travelers <N> \
     [--trip "<TRIP LABEL>"]
   ```
3. Poll the shell's output every 30-60s via `Read`. Surface meaningful new lines: `Searching <site>...`, `✓ <Site>: N result(s)`, `✗ <Site>: <error>`. Stop when output contains `Done.` or shell exits.

Sites covered: Southwest Vacations, Costco Travel, Expedia, Kayak. Results write directly to SQLite.

## Step 3 — Summarize the results

Query the DB:

- Call `mcp__chacon-travel-db__get_best_fares` with the destination slug for the cheapest package.
- Call `mcp__chacon-travel-db__get_price_history` with `category="vacation-packages"` and the slug for the full row set.

Render a concise summary table (top 5-8 packages sorted by Total ascending):

| Site | Package / Hotel | Flight Cost | Hotel Cost | Per Person | Total |
|---|---|---|---|---|---|
| Costco Travel | Hilton Anaheim + Flights | $612 | $1,420 | $1,016 | $2,032 |

If a prior snapshot exists, surface the price-drift highlight.

If a site returned an error, mention it briefly — site blocks are common and not fatal.

## Step 4 — Offer follow-ups

- If this was a new trip and the user gave a label, mention they can re-run with `/trip-rerun "<label>"`.
- If `--export` wasn't used, mention they can re-run with `--export` to get .md/.csv files alongside the DB.
