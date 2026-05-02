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
  - **Anchor / experience** — after the user gives a destination, infer 4-6 well-known landmarks or attractions in that area and offer them via a multi-choice AskUserQuestion plus a "None / use destination as-is" option. Examples: Orlando → Disney World, Universal Studios, Islands of Adventure, SeaWorld, Disney Springs. Las Vegas → The Strip, Caesars Palace, Bellagio, Fremont Street. New York City → Times Square, Central Park, Empire State Building, Brooklyn Bridge. The user's pick becomes the geocoding origin so hotel distances reflect proximity to what they actually care about.
  - **Check-in date** (YYYY-MM-DD)
  - **Check-out date** (YYYY-MM-DD)
  - **Number of guests** (default 1)
  - **Number of rooms** (default 1)
  - **Trip label** — optional, only ask if the user wants to bookmark this for re-runs

## Step 2 — Run the search

Hotel searches typically take 5-10 minutes (multiple sites in parallel + per-hotel detail-page drilldown). To give the user live progress instead of a silent buffer:

1. **Tell the user upfront:** "Hotel searches across all sites typically take 5-10 minutes. I'll surface progress as each site reports in."
2. **Run the Bash command with `run_in_background: true`:**
   ```
   node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" hotels \
     --destination "<DESTINATION>" \
     --depart <YYYY-MM-DD> --return <YYYY-MM-DD> \
     --travelers <N> --rooms <N> \
     [--anchor "<LANDMARK>"] \
     [--trip "<TRIP LABEL>"]
   ```
   This returns a shell ID immediately.
3. **Poll progress every 30-60 seconds** by reading the shell's output (`Read` on the shell ID). Each poll, surface any NEW lines that look like meaningful status — patterns to watch for:
   - `Searching <site>...` (a site started)
   - `[Google Hotels] N qualifying hotel cards — drilling top M` (SERP loaded)
   - `[Google Hotels] <hotel name>: parsed N price row(s)` (hotel finished)
   - `✓ <Site>: N result(s)` (site succeeded)
   - `✗ <Site>: <error>` (site failed)
   - `Done.` (everything finished)

   Skip the per-click debug noise (`[KH cal attempt=…]`, `[AB] dest field clicked`, etc. — those are gated behind `--debug` and shouldn't appear).

4. **Exit polling** when output contains `Done.` OR the shell exits.

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
