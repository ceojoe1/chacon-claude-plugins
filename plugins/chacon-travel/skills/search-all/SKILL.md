---
name: search-all
description: Run flights, hotels, and vacation-packages searches simultaneously as parallel sub-agents and aggregate into a unified trip cost summary. Use when the user wants a full trip cost picture in one go.
---

Search all travel categories (flights, hotels, vacation packages) in parallel using sub-agents, then aggregate results into a unified trip summary.

When this skill is invoked:

## Step 1 — Collect Inputs

First, check whether `travel_plans/` exists and contains any destination folders.

- If **existing destination folders are found**, use AskUserQuestion to ask the user:
  - "Which destination would you like to search?" with one option per existing folder (using the folder name as the label) plus a "New destination" option
  - If they pick an existing destination, pre-fill the destination and skip asking for it again
  - If they pick "New destination", prompt for the destination as normal

Then collect all remaining details via a **single** AskUserQuestion call:
- Origin city (departure airport or city)
- Destination city — skip if pre-filled
- Departure date (YYYY-MM-DD)
- Return date (YYYY-MM-DD)
- Number of travelers
- Number of rooms (for hotels, default 1)

**Experiences** — ask which experiences they plan to attend using multiSelect: true. Offer destination-appropriate options (e.g. for Orlando: Theme Parks, Disney World, Universal Studios, International Drive, Beaches). Always include "Other / No preference".

## Step 2 — Parallel Playwright Searches (headless only)

Spawn all three Playwright searches **simultaneously** using the Agent tool with `run_in_background: true`. These run headless with no Chrome MCP — pure Playwright only.

### Sub-agent: Flights (Playwright only)
```
Run ONLY the Playwright headless step for the /flights skill. Do NOT use Chrome MCP. Do not ask questions.

Run:
  node playwright/search.js flights --origin "[origin]" --destination "[destination]" --depart [depart] --return [return] --travelers [travelers]

Wait for it to complete, then report back: which sites succeeded, which returned N/A, and the path to results.md.
```

### Sub-agent: Hotels (Playwright only)
```
Run ONLY the Playwright headless step for the /hotels skill. Do NOT use Chrome MCP. Do not ask questions.

Run:
  node playwright/search.js hotels --destination "[destination]" --depart [depart] --return [return] --travelers [travelers] --rooms [rooms]

Wait for it to complete, then report back: which sites succeeded, which returned N/A, and the path to results.md.
```

### Sub-agent: Vacation Packages (Playwright only)
```
Run ONLY the Playwright headless step for the /vacation-packages skill. Do NOT use Chrome MCP. Do not ask questions.

Run:
  node playwright/search.js vacation-packages --origin "[origin]" --destination "[destination]" --depart [depart] --return [return] --travelers [travelers]

Wait for it to complete, then report back: which sites succeeded, which returned N/A, and the path to results.md.
```

Inform the user:
> "Running Playwright searches for flights, hotels, and vacation packages in parallel..."

Wait for all three to complete before proceeding.

## Step 3 — Sequential Chrome MCP Gap-filling

**Chrome MCP must run sequentially** — only one skill uses the browser at a time to avoid collisions.

After all three Playwright agents complete, read each results.md and collect the N/A rows across all three categories.

Then fill gaps **one at a time** in this order:

1. **Flights N/A sites** — use Chrome MCP per `.claude/skills/flights/sites/` guides
2. **Hotels N/A sites** — use Chrome MCP per `.claude/skills/hotels/sites/` guides  
3. **Vacation Packages N/A sites** — use Chrome MCP per `.claude/skills/vacation-packages/sites/` guides

After filling each category's gaps, update that category's results.md and summary.md before moving to the next.

If a site is CAPTCHA/bot-blocked after one attempt, mark it N/A and move on — do not retry.

## Step 4 — Aggregate and Present Results

Once all gap-filling is complete, present a unified summary:

```
# Trip Cost Summary — [Destination]
[Origin] → [Destination] | [Depart]–[Return] | [N] Travelers

## Best Options by Category

| Category | Best Option | Per Person | Total ([N]) | Site |
|---|---|---|---|---|
| ✈️ Flights | [best airline + route] | $X | $X | [site] |
| 🏨 Hotels | [best property] | $X/night | $X total | [site] |
| 📦 Package | [best package] | $X | $X | [site] |

## Combined Estimates

| Scenario | Flights | Hotels | Total |
|---|---|---|---|
| Budget (cheapest each) | $X | $X | **$X** |
| Mid-range | $X | $X | **$X** |
| Package deal | — | — | **$X** |
```

Note any sites that returned N/A (CAPTCHA-blocked) so the user knows where to check manually.

## Step 5 — Update summary.md

Verify `travel_plans/[slug]/summary.md` reflects all three categories with today's date. Add a combined search history entry:
```
- `search-all/[YYYY-MM-DD]` — Full parallel search (flights + hotels + packages)
```
