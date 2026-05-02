---
name: travel-import
description: Import legacy results.csv files (from before chacon-travel switched to SQLite) into the new database. Use when the user has accumulated travel_plans/*/*.csv files from older runs and wants them queryable via the travel DB.
---

Backfill the SQLite database with legacy `results.csv` files.

## Step 1 — Ask for the source directory

Use AskUserQuestion to get the path to the legacy `travel_plans/` directory. Default suggestion: `./travel_plans` (relative to the user's project) or wherever they stored their old runs.

## Step 2 — Run the importer

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/import.js" "<PATH-TO-LEGACY-DIR>"
```

The importer:
- Walks the directory recursively for `results.csv` files
- Detects category (flights / hotels / vacation-packages) from CSV headers
- Groups rows by trip key (origin + destination + dates) and snapshot date
- Upserts trip metadata + per-snapshot search rows + child result rows
- Preserves original snapshot dates so price drift queries work historically

## Step 3 — Confirm

Forward the importer's output (file count + per-file row totals). Tell the user they can now query their historical data with `mcp__chacon-travel-db__get_trips`, `get_price_history`, and `get_best_fares`.

If 0 files were found, suggest the user verify the directory path (most likely they used a different folder name or the data dir was inside the plugin already).
