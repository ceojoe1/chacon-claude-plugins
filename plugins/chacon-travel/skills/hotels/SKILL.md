---
name: hotels
description: Search travel sites for hotels and vacation rentals and return a cost comparison summary. Use when the user wants to find hotels, vacation rentals, or compare lodging options for a trip.
---

Search travel sites for hotels and present a cost comparison.

## Step 1 — Resolve trip parameters

Call `mcp__chacon-travel-db__get_trips` to list saved trips.

- If trips are returned, use AskUserQuestion to ask which trip to search (one option per trip, label format: `<name> — <destination>, <check-in> to <check-out>`) plus a "New trip" option.
- If the user picks a saved trip, pull destination/check-in/check-out/travelers/rooms from its row — skip those questions.
- If "New trip" or no saved trips, prompt for missing fields via AskUserQuestion:
  - **Destination** (city, neighborhood, or address)
  - **Check-in date** (YYYY-MM-DD)
  - **Check-out date** (YYYY-MM-DD)
  - **Number of guests** (default 1)
  - **Number of rooms** (default 1)
  - **Trip label** — optional, only ask if the user wants to bookmark this for re-runs

## Step 2 — Run the search

Use the Bash tool. The script writes results directly to the SQLite DB; nothing in the project working directory is touched.

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" hotels \
  --destination "<DESTINATION>" \
  --depart <YYYY-MM-DD> --return <YYYY-MM-DD> \
  --travelers <N> --rooms <N> \
  [--trip "<TRIP LABEL>"]
```

Wait for the command to finish. The output prints which sites succeeded and how many rows landed.

## Step 3 — Summarize the results

Query the DB for the freshly written snapshot:

- Call `mcp__chacon-travel-db__get_best_fares` with the destination slug (printed by the search command, e.g. `san-francisco-ca`) to get the lowest-priced option.
- Call `mcp__chacon-travel-db__get_price_history` with `category="hotels"` and the slug to get all rows from this snapshot.

Render a concise summary table (top 5-8 options sorted by total ascending):

| Hotel | Distance | Rating | Per Night | Total | Fees | Source |
|---|---|---|---|---|---|---|
| Warfield Hotel | 0.5 mi | ⭐3.1 | $74 | $295 | $44 | Agoda |

If multiple snapshots exist for this trip+category in the price history, surface the price-drift highlight:
> "Cheapest hotel dropped from $312 → $295 since last search on 2026-04-28."

## Step 4 — Offer follow-ups

After the table, offer one or both of these (only if applicable):

- If this was a new trip and the user gave a label, mention it's been saved and they can re-run with `/trip-rerun "<label>"`.
- If `--export` wasn't used, mention the user can re-run with `--export` to get .md/.csv files alongside the DB.
