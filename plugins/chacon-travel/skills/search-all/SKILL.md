---
name: search-all
description: Run flights, hotels, and vacation-packages searches in parallel for a single trip and aggregate into a unified cost summary. Use when the user wants a full trip cost picture in one go.
---

Search all three travel categories (flights, hotels, vacation packages) in parallel, then aggregate into one summary.

## Step 1 — Resolve trip parameters

Call `mcp__chacon-travel-db__get_trips` to list saved trips.

- If trips are returned, use AskUserQuestion to ask which trip to search plus a "New trip" option.
- If the user picks a saved trip, pull origin/destination/depart/return/travelers/rooms from its row.
- If "New trip" or no saved trips, prompt via a single AskUserQuestion call for:
  - **Origin** (city or airport code) — required for flights/packages
  - **Destination** (city, region, or address)
  - **Departure date** (YYYY-MM-DD)
  - **Return date** (YYYY-MM-DD)
  - **Number of travelers** (default 1)
  - **Number of rooms** (for hotels, default 1)
  - **Trip label** — optional, only ask if the user wants to bookmark this for re-runs

## Step 2 — Run all three searches in parallel

Spawn three sub-agents in a single message via the Agent tool with `run_in_background: true`. Each sub-agent runs one Playwright category. The DB writer handles dedupe so concurrent writes against the same trip are safe.

### Sub-agent: Flights
```
Run the headless Playwright search for flights only. Do not ask questions.
Run:
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" flights --origin "[origin]" --destination "[destination]" --depart [depart] --return [return] --travelers [travelers] [--trip "[trip label]"]
Wait for it to complete and report which sites succeeded vs. errored.
```

### Sub-agent: Hotels
```
Run the headless Playwright search for hotels only. Do not ask questions.
Run:
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" hotels --destination "[destination]" --depart [depart] --return [return] --travelers [travelers] --rooms [rooms] [--trip "[trip label]"]
Wait for it to complete and report which sites succeeded vs. errored.
```

### Sub-agent: Vacation Packages
```
Run the headless Playwright search for vacation packages only. Do not ask questions.
Run:
  node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" vacation-packages --origin "[origin]" --destination "[destination]" --depart [depart] --return [return] --travelers [travelers] [--trip "[trip label]"]
Wait for it to complete and report which sites succeeded vs. errored.
```

Tell the user once: "Running flights + hotels + vacation packages in parallel — this typically takes 5-10 minutes."

Wait for all three to complete before proceeding.

## Step 3 — Aggregate and present

Query the DB for the freshly written snapshots:

- Call `mcp__chacon-travel-db__get_best_fares` with the destination slug — returns the cheapest option per category.
- Call `mcp__chacon-travel-db__get_price_history` for any category where you want to surface a price drift vs. the previous snapshot.

Render a unified summary:

```
# Trip Cost Summary — [Destination]
[Origin] → [Destination] | [Depart]–[Return] | [N] Travelers

## Best Options by Category
| Category | Best Option | Per Person | Total | Source |
|---|---|---|---|---|
| ✈️ Flights | [airline] | $X | $X | [site] |
| 🏨 Hotels | [property] | $X/night | $X total | [site] |
| 📦 Package | [package name] | $X | $X | [site] |

## Combined Estimates
| Scenario | Flights | Hotels | Total |
|---|---|---|---|
| À la carte (flight + hotel separately) | $X | $X | **$X** |
| Package deal | — | — | **$X** |
```

If a site returned an error in any category, note it briefly. Surface any meaningful price drifts vs. the previous snapshot for this trip.

## Step 4 — Offer follow-ups

- If this was a new trip and the user gave a label, mention it's been saved and they can re-run with `/trip-rerun "<label>"`.
- If `--export` wasn't used, mention they can re-run with `--export` to get .md/.csv files alongside the DB.
