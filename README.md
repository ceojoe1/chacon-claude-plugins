# chacon-claude-plugins

A personal Claude Code plugin marketplace for browser-automated travel search.

## Install

Add the marketplace to Claude Code once, then install any plugin from it:

```shell
/plugin marketplace add ceojoe1/chacon-claude-plugins
/plugin install chacon-travel@chacon-marketplace
```

After installing, the following skills are available:

| Command | Description |
|---|---|
| `/chacon-travel:flights` | Search Google Flights, Southwest, Expedia, and Kayak for round-trip fares |
| `/chacon-travel:hotels` | Search Google Hotels, Expedia, Kayak, Costco Travel, VRBO, and Airbnb for hotels and vacation rentals |
| `/chacon-travel:vacation-packages` | Search Southwest Vacations, Costco Travel, Expedia, and Kayak for bundled flight + hotel packages |
| `/chacon-travel:search-all` | Run all three searches in parallel as sub-agents and aggregate into a unified trip cost summary |

### Playwright runtime (required)

The skills run headless browser searches via Playwright. After installing the plugin, run `/chacon-travel:travel-setup` once — it installs Playwright dependencies inside the plugin directory and registers the travel DB MCP server. The runtime stays inside the plugin install location; nothing is copied into your project.

### Chrome MCP fallback (recommended)

Install the [Claude-in-Chrome](https://chromewebstore.google.com/detail/claude-in-chrome) extension to fill in results that Playwright can't reach (CAPTCHA-blocked sites).

---

## Plugins

### `chacon-travel`

Searches flights, hotels, and vacation packages across major travel sites using headless Playwright with Chrome MCP fallback.

**Sites covered:** Google Flights · Google Hotels · Southwest Airlines · Expedia · Kayak · Costco Travel · VRBO · Airbnb · Southwest Vacations

**How it works:**

1. **Playwright (headless)** — Runs all configured sites in parallel via `Promise.allSettled`. Results saved to `travel_plans/[destination]/[category]/processed=[date]/results.md`.
2. **Chrome MCP fallback** — CAPTCHA-blocked sites get filled via the Claude-in-Chrome extension, sequentially to avoid browser collisions.
3. **`/chacon-travel:search-all`** — Spawns all three skills as parallel background sub-agents for the Playwright phase, then sequentially handles Chrome MCP gap-filling before presenting a unified cost summary.

---

## Structure

```
.claude-plugin/
  marketplace.json              # marketplace registry (chacon-marketplace)

plugins/
  chacon-travel/
    .claude-plugin/
      plugin.json               # plugin manifest
    skills/                     # skill definitions (auto-discovered by Claude Code)
      flights/SKILL.md + sites/
      hotels/SKILL.md + sites/
      vacation-packages/SKILL.md + sites/
      search-all/SKILL.md
    playwright/                 # headless site scripts
      flights/   hotels/   vacation-packages/

playwright/                     # shared Playwright runtime (install separately)
  lib/                          # args, browser, writer, summary
  sites/helpers.js              # shared utilities
  search.js                     # CLI entry point

.claude/
  skills/                       # standalone installs (short names, this project only)
```

---

## Requirements

- [Claude Code](https://claude.ai/code)
- Node.js 18+
- [Claude-in-Chrome](https://chromewebstore.google.com/detail/claude-in-chrome) extension (for CAPTCHA fallback)
