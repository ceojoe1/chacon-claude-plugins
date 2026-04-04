# vacAI Playwright Migration — Task List

## Phase 1: Scaffolding

- [x] Create `playwright/package.json` with dependencies (playwright, playwright-extra, puppeteer-extra-plugin-stealth, minimist)
- [x] Create `playwright/.gitignore` (node_modules/, logs/)
- [x] Run `npm install` in `playwright/`

## Phase 2: Core Library (no browser)

- [x] Implement `playwright/lib/args.js` — CLI arg parsing, validation, slug derivation
- [x] Implement `playwright/lib/writer.js` — writes results.md in existing format
- [x] Implement `playwright/lib/summary.js` — upserts summary.md (Latest Prices, Price History, Search History)

## Phase 3: Browser Factory + Helpers

- [x] Implement `playwright/lib/browser.js` — stealth Chromium launch (playwright-extra + stealth plugin, realistic user-agent/viewport/locale)
- [x] Implement `playwright/sites/helpers.js` — humanDelay, selectCalendarDate, parsePrice, detectCaptcha

## Phase 4: CLI Entry Point

- [x] Implement `playwright/search.js` — wires args → site registry → browser → writer → summary

## Phase 5: Flight Sites

- [x] Implement `playwright/sites/flights/google-flights.js`
- [x] Implement `playwright/sites/flights/southwest.js`
- [x] Implement `playwright/sites/flights/expedia.js`
- [x] Implement `playwright/sites/flights/kayak.js`

## Phase 6: Hotel Sites

- [x] Implement `playwright/sites/hotels/google-hotels.js`
- [x] Implement `playwright/sites/hotels/expedia.js`
- [x] Implement `playwright/sites/hotels/kayak.js`
- [x] Implement `playwright/sites/hotels/costco-travel.js` (graceful N/A fallback)
- [x] Implement `playwright/sites/hotels/vrbo.js`
- [x] Implement `playwright/sites/hotels/airbnb.js`

## Phase 7: Vacation Package Sites

- [x] Implement `playwright/sites/vacation-packages/southwest-vacations.js`
- [x] Implement `playwright/sites/vacation-packages/costco-travel.js`
- [x] Implement `playwright/sites/vacation-packages/expedia.js`
- [x] Implement `playwright/sites/vacation-packages/kayak.js`

## Phase 8: Scheduling

- [x] Create `playwright/run-weekly.bat` — convenience wrapper with trip params
- [x] Document Task Scheduler setup command in `playwright/README.md`

## Phase 9: Skill Integration

- [x] Update `.claude/skills/flights/SKILL.md` — add Playwright alternate execution section
- [x] Update `.claude/skills/hotels/SKILL.md` — add Playwright alternate execution section
- [x] Update `.claude/skills/vacation-packages/SKILL.md` — add Playwright alternate execution section

## Phase 10: Parallelization — Playwright

- [x] Refactor `playwright/search.js` to run all sites concurrently via `Promise.all` instead of sequentially
- [x] Add `--no-parallel` flag (default on) to allow opting out for debugging

## Phase 11: Plugin Marketplace Structure

- [x] Create `.claude-plugin/marketplace.json` — top-level plugin registry
- [x] Move `/flights` skill into `plugins/flights/` with its own `SKILL.md`, `sites/`, and playwright scripts
- [x] Move `/hotels` skill into `plugins/hotels/` with its own `SKILL.md`, `sites/`, and playwright scripts
- [x] Move `/vacation-packages` skill into `plugins/vacation-packages/` with its own `SKILL.md`, `sites/`, and playwright scripts
- [x] Each plugin bundles its own Playwright site scripts (no shared browser dependency)

## Phase 12: Orchestrator Skill (`/search-all`)

- [x] Create `.claude/skills/search-all/SKILL.md` — new `/search-all` skill
  - Collects destination + trip params once (shared across all skills)
  - Spawns `/flights`, `/hotels`, `/vacation-packages` as parallel background sub-agents
  - Waits for all three to complete
  - Aggregates results into a combined trip summary
- [x] Update `travel_plans/[destination]/summary.md` schema to support combined-run metadata (which skills ran, timestamps per skill)
