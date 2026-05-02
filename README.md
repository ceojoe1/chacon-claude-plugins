# chacon-claude-plugins

A Claude Code plugin marketplace with travel-search tools.

The current plugin is **`chacon-travel`** — search real travel sites for flights, hotels, and vacation packages, store results in a local SQLite database, and ask Claude follow-up questions like "what's the cheapest week to fly to SF?"

## Install

Add the marketplace once, install the plugin, then run setup:

```shell
/plugin marketplace add ceojoe1/chacon-claude-plugins
/plugin install chacon-travel@chacon-marketplace
/chacon-travel:travel-setup
```

`travel-setup` installs Playwright dependencies and registers the travel database — both inside the plugin install directory. **Nothing is copied into your project.**

After setup, restart Claude Code to activate the database query tools.

## What you get

| Command | What it does |
|---|---|
| `/chacon-travel:flights` | Search Google Flights, Kayak, Expedia for round-trip fares |
| `/chacon-travel:hotels` | Search Google Hotels for hotels and vacation rentals |
| `/chacon-travel:vacation-packages` | Search Southwest Vacations, Costco Travel, Expedia, Kayak for bundled deals |
| `/chacon-travel:search-all` | Run all three in parallel and aggregate into a unified summary |
| `/chacon-travel:trip-save` | Bookmark a trip definition (destination, dates, travelers) for re-runs |
| `/chacon-travel:trip-list` | List all saved trips with last-search dates |
| `/chacon-travel:trip-rerun` | Re-run all searches for a saved trip in one go |
| `/chacon-travel:travel-import` | Backfill the database from legacy `results.csv` files |

Plus query tools registered as MCP server `chacon-travel-db`:

- `get_trips` — list everything you've searched
- `get_best_fares` — cheapest option per category for a destination
- `get_price_history` — every snapshot for a destination over time
- `compare_destinations` — best fare across destinations for one category
- `get_site_reliability` — which sites tend to block / return errors

You can ask Claude things like *"compare the cheapest hotel I've found in San Francisco vs Oakland"* and it will use these tools.

## How it works

1. You invoke a skill (`/chacon-travel:hotels`).
2. The skill prompts for any missing inputs, or pulls them from a saved trip if you have one.
3. Headless Playwright searches the configured sites in parallel.
4. Results are written to a SQLite database at `<plugin-root>/data/vacai.db`.
5. The skill summarizes the results — and surfaces price drift if you've searched the same trip before.

Re-running the same search on the same day **updates** existing rows. Re-running on a different day **adds a new snapshot**, so you can see how prices move over time.

By default no flat files are written. Pass `--export` to also generate `.md`/`.csv` alongside the database.

## Requirements

- [Claude Code](https://claude.ai/code)
- Node.js 24 or newer (for the built-in `node:sqlite` API — earlier 22.x requires the `--experimental-sqlite` flag)
- An internet connection

## Where data lives

| What | Where |
|---|---|
| Database | `<plugin-root>/data/vacai.db` |
| Optional .md/.csv exports | `<plugin-root>/data/<destination-slug>/<category>/` |
| Override location | set `CHACON_TRAVEL_DATA_DIR` env var |

The plugin install root resolves automatically. If the plugin directory isn't writable on your system, data falls back to `~/.claude/chacon-travel/data/`.

## Repository structure

```
.claude-plugin/marketplace.json   # marketplace registry
plugins/chacon-travel/
  .claude-plugin/plugin.json      # plugin manifest
  skills/                         # all /chacon-travel:* commands
  playwright/                     # headless search runtime
    search.js  trip.js  import.js # CLI entry points
    flights/   hotels/   vacation-packages/   # per-site scrapers
    lib/                          # args, browser, db, writer, geocoding
  mcp/
    travel-db.js  schema.sql      # query MCP server + DB schema
  data/                           # vacai.db (created on first run)
```

## Contributing

Issues and pull requests welcome. See `debugging/` for per-site scraper notes — useful if you want to add or fix a travel site.
