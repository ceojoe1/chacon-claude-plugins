---
name: trip-rerun
description: Re-run all searches (flights, hotels, vacation packages) for a previously-saved trip. Use when the user wants a fresh price snapshot for a trip they bookmarked with /trip-save.
---

Re-run all category searches for a previously-saved trip.

## Step 1 — Resolve trip name

If the user passed a trip name in the slash command (e.g. `/trip-rerun "Databricks AI Summit 2026"`), use it. Otherwise:
- Run `/trip-list` first to show the user available trips
- Ask which trip they want to re-run via AskUserQuestion

## Step 2 — Run

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/trip.js" rerun "<TRIP NAME>"
```

This spawns the appropriate search categories sequentially:
- If the trip has a saved origin → flights + hotels + vacation-packages
- If no origin → hotels only

By default the trip uses all categories its origin supports. To restrict, pass `--categories flights,hotels` (subset of `flights`, `hotels`, `vacation-packages`).

## Step 3 — Summarize

After the run finishes, query the DB for the new vs previous snapshot to surface price-drift highlights. Use the `mcp__chacon-travel-db__get_price_history` MCP tool with the trip's slug to fetch the latest two snapshots per category, then report any meaningful price changes (e.g. "Flights via Delta dropped from $612 → $589").

If this is the first run for the trip, just report the latest prices found.
