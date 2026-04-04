# chacon-claude-plugins

A personal Claude Code plugin marketplace for browser-automated travel search.

## Plugins

### `chacon-travel`

Searches flights, hotels, and vacation packages across major travel sites using headless Playwright with Chrome MCP fallback.

**Skills / Commands**

| Command | Description |
|---|---|
| `/flights` | Search Google Flights, Southwest, Expedia, and Kayak for round-trip fares |
| `/hotels` | Search Google Hotels, Expedia, Kayak, Costco Travel, VRBO, and Airbnb for hotels and vacation rentals |
| `/vacation-packages` | Search Southwest Vacations, Costco Travel, Expedia, and Kayak for bundled flight + hotel packages |
| `/search-all` | Run all three searches in parallel as sub-agents and aggregate into a unified trip cost summary |

**Sites Covered**

- Google Flights / Google Hotels
- Southwest Airlines
- Expedia
- Kayak
- Costco Travel
- VRBO
- Airbnb
- Southwest Vacations

## How It Works

1. **Playwright (headless)** — Each skill runs a headless Chromium search across all configured sites in parallel via `Promise.allSettled`. Results are written to `travel_plans/[destination]/[category]/processed=[date]/results.md`.

2. **Chrome MCP fallback** — Any site that returns N/A (CAPTCHA, bot block) gets filled in manually via the Claude-in-Chrome MCP extension, one site at a time sequentially to avoid browser collisions.

3. **`/search-all` orchestration** — Spawns all three skill agents as parallel background sub-agents for the Playwright phase, then sequentially handles Chrome MCP gap-filling itself before presenting a unified cost summary.

## Structure

```
.chacon-marketplace/
  marketplace.json          # plugin registry

plugins/
  chacon-travel/
    plugin.json             # single plugin, 4 skills
    skills/                 # self-contained skill definitions + site guides
      flights/
      hotels/
      vacation-packages/
      search-all/
    playwright/             # headless site scripts
      flights/
      hotels/
      vacation-packages/

playwright/                 # shared Playwright runtime
  lib/                      # args, browser, writer, summary
  sites/
    helpers.js              # shared utilities (humanDelay, detectCaptcha, etc.)
  search.js                 # CLI entry point

.claude/
  skills/                   # installed skills (Claude Code reads from here)
  settings.json
```

## Requirements

- [Claude Code](https://claude.ai/code)
- [Claude-in-Chrome](https://chromewebstore.google.com/detail/claude-in-chrome) extension
- Node.js 18+

```bash
cd playwright && npm install
```
