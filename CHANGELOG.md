# Changelog

All notable changes to chacon-claude-plugins are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.1] — 2026-05-02

### Added
- `--anchor` CLI flag — landmark/experience used as the geocoding origin for hotel distance calculation. `/hotels` and `/search-all` skills now ask the user to pick a well-known landmark in their destination (e.g. Orlando → Disney/Universal/Islands of Adventure) so distances reflect proximity to what the trip is actually about.
- MCP `get_price_history` renders Source Link as a short clickable markdown link (`[booking.com](full-url)`) instead of the raw 200-char Google redirect URL.

### Added
- `--debug` CLI flag — gates verbose scraper logs (per-click traces, calendar nav, price-element counts) behind a flag. Default off so user-facing runs stay clean.
- `lib/log.js` — tiny logger with `info()` (always prints) and `debug()` (only when `CHACON_DEBUG=1`).

### Changed
- Default per-site timeout bumped 300s → 600s. The 8-hotels × 6-sites parallel run was hitting the previous limit before partial-results could be returned.
- Google Hotels SERP filter now excludes vacation rentals / apartments / condos / villas — they use a different DOM with no triple-dollar pattern and burn drilldown budget on 0 results.
- Hotels registry trimmed to the working scrapers: Google Hotels, Kayak, Airbnb. Expedia, Costco Travel, and VRBO are commented out pending fixes (tracked in CLAUDE.md backlog).
- Flights registry trimmed to the working scrapers: Google Flights, Kayak, United. Southwest, Expedia, and Orbitz are commented out (XHR block / Akamai / DataDome respectively — tracked in CLAUDE.md backlog).
- Kayak and Airbnb hotel scrapers' click-by-click logs now use `debug()` instead of `console.log()` — silent by default unless `--debug` is passed.

## [2.0.0] — 2026-05-02

### Breaking
- Plugin now runs in place from `${CLAUDE_PLUGIN_ROOT}` — `/travel-setup` no longer copies `playwright/` or `mcp/` into the user's working directory.
- Default output location moved from `<cwd>/travel_plans/` to `<plugin-root>/data/`.
- Search results persist to a SQLite database (`vacai.db`) instead of `.md`/`.csv` flat files. Pass `--export` to also generate the legacy flat-file outputs.
- Minimum Node.js version bumped to **24+** (for the built-in unflagged `node:sqlite` API).

### Added
- `mcp/schema.sql` — canonical SQLite schema with dedupe constraints. Same trip + category + day = single search row; cross-day appends a snapshot for price-drift queries.
- `lib/db.js` — DB layer (open, schema bootstrap, upsert helpers).
- `lib/data-dir.js` — single resolver for the data directory; honors `CHACON_TRAVEL_DATA_DIR` / `TRAVEL_PLANS_DIR`; falls back to `~/.claude/chacon-travel/data` if the plugin dir is read-only.
- `lib/distance.js` — Nominatim-based geocoding + Haversine for hotel-to-destination distance calculation.
- `playwright/trip.js` CLI — `save | list | rerun` subcommands.
- `playwright/import.js` CLI — backfills legacy `results.csv` files into the new SQLite schema.
- New skills: `/trip-save`, `/trip-list`, `/trip-rerun`, `/travel-import`.
- Hotel results now capture distance, fees, source, source link, and hotel address; new CLI flags `--trip` and `--max-hotels`.
- Google Hotels scraper extracts stay totals directly from the DOM (modal-free) and walks the SERP card → detail page flow per hotel.

### Changed
- `/flights`, `/hotels`, `/vacation-packages`, `/search-all` skills rewritten to be DB-first: prompt clearly for missing args, surface saved trips up front, render concise summary tables, surface price-drift highlights vs prior snapshots.
- `--no-warnings` added to all skill node invocations to suppress the `node:sqlite` ExperimentalWarning.
- README rewritten user-first with the new install + first-run flow.
- Plugin descriptions refreshed to drop the obsolete Chrome MCP fallback narrative.

### Removed
- The `travel_plans/` directory in user projects is no longer used — clean up after upgrading.
- The Chrome MCP gap-fill flow from `/search-all` (was based on the old N/A-row file format).

## [1.2.5] — 2026-04-29

Last v1 release. See git history for prior changes.

[2.0.1]: https://github.com/ceojoe1/chacon-claude-plugins/compare/v2.0.0...HEAD
[2.0.0]: https://github.com/ceojoe1/chacon-claude-plugins/compare/v1.2.5...v2.0.0
[1.2.5]: https://github.com/ceojoe1/chacon-claude-plugins/releases/tag/v1.2.5
