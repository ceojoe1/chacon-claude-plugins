---
name: vacation-packages
description: Search for bundled flight + hotel vacation packages and return a cost estimate table. Use when the user wants to find vacation packages, travel bundles, or combined flight and hotel deals.
---

Search travel sites for bundled flight + hotel vacation packages, return a cost estimate table, and save results.

When this skill is invoked:

## Step 1 — Collect Inputs

First, call the `mcp__chacon-travel-db__get_trips` tool to retrieve stored trips from the database.

- If **trips are returned**, use AskUserQuestion to ask the user:
  - "Which trip would you like to search vacation packages for?" with one option per trip (label format: `[destination] — [check-in] to [check-out], [N] travelers, from [origin]`) plus a "New trip" option
  - If they pick an existing trip, pre-fill destination, origin, check-in, check-out, and traveler count from that trip record — skip asking for those fields
  - If they pick "New trip", prompt for all details as normal

Then collect any remaining missing details via AskUserQuestion:
- Destination (city or area) — skip if pre-filled from a stored trip
- Departure city (origin for flights) — skip if pre-filled
- Check-in date (YYYY-MM-DD) — skip if pre-filled
- Check-out date (YYYY-MM-DD) — skip if pre-filled
- Number of travelers (exact whole number, e.g. 2, 3, 4) — skip if pre-filled

**Experiences** — ask the user which experiences they plan to attend, using multiSelect: true. Offer 3–4 destination-appropriate options based on the destination (e.g., for Orlando: Theme Parks, Disney World, Universal Studios, International Drive, Beaches). Always include an "Other / No preference" option. The user may select multiple.

Use the selected experiences to:
- Prioritize packages whose hotel is close to or affiliated with the chosen experiences (e.g., Disney-area resort for Disney World, I-Drive hotel for Universal)
- Note which packages include experience-relevant perks (park tickets, resort access, shuttle service)
- When comparing packages of similar price, prefer the one with better experience alignment

## Step 2 — Search Travel Sites

### Step 2a — Run Playwright headless search

Use the Bash tool to run:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/search.js" vacation-packages --origin "<ORIGIN>" --destination "<DESTINATION>" --depart <YYYY-MM-DD> --return <YYYY-MM-DD> --travelers <N>
```

This writes results to `travel_plans/[destination-slug]/vacation_packages/processed=[YYYY-MM-DD]/results.md` and updates `summary.md` automatically. Wait for the command to complete.

### Step 2b — Read results and identify gaps

Read the written `results.md` file. Identify any rows marked `N/A` or sites that returned an error.

### Step 2c — Fill gaps with Chrome MCP

> **Silent mode:** Execute all Chrome MCP browser steps without narrating individual actions (clicks, scrolls, typing). Use the tools quietly and only report the final prices found or a single error message if a site is blocked.

For each site with an N/A result, use `mcp__claude-in-chrome__*` tools to search that site in Chrome and retrieve results. Refer to the per-site navigation guides in `sites/` for UI steps:

1. **Southwest Vacations** — https://www.southwest.com/vacations/ → `sites/southwest-vacations.md`
2. **Costco Travel** — https://www.costcotravel.com/Vacation-Packages → `sites/costco-travel.md`
3. **Expedia** — https://www.expedia.com/Vacation-Packages → `sites/expedia.md`
4. **Kayak** — https://www.kayak.com/packages → `sites/kayak.md`

For each selected option, note:
- Package/hotel name
- Flight cost (if shown separately)
- Hotel cost (if shown separately)
- Total package price
- Price per person
- Total for the full group
- Experience fit (proximity to or inclusion of selected experiences)

### Step 2d — Update results file with MCP data

If any MCP searches succeeded, edit `results.md` to replace the N/A rows with the new data.

For each site, find the top **1–4** highest-quality or most preferred package options. Prioritize by:
1. **Experience alignment** — packages whose hotel is near or includes perks tied to selected experiences rank first (e.g., park tickets for Disney World, beachfront for Beaches)
2. **Hotel quality** — 4-star minimum; must have a pool; prefer properties with a gym, on-site family dining or quality restaurant, and resort-style perks (spa, kids' club, free breakfast, concierge)
3. **Flight quality** (nonstop or 1-stop preferred; major carriers over ultra-low-cost)
4. **Included perks** (resort credits, breakfast, park tickets, free cancellation, shuttle service)
5. **Value** (best combined quality-to-price ratio within mid/upper tier)

**Skip** packages whose hotel is budget/economy class, below 4-star, lacks a pool, or is rated below 8.0/10. If a site only returns budget packages, note it rather than surfacing low-quality results.

If a site still cannot be searched after MCP attempt, leave it as "N/A" and move on.

## Step 3 — Output Results Table

Present the results as a markdown table (up to **8 best options** across all sites, prioritized by experience alignment):

| Site | Package / Hotel | Flight Cost | Hotel Cost | Per Person | Total (Group) | Experience Fit |
|---|---|---|---|---|---|---|
| Southwest Vacations | ... | $X | $X | $X | $X | Disney area, park shuttle |
| Costco Travel | ... | $X | $X | $X | $X | Includes 4-day Disney tickets |
| Expedia | ... | $X | $X | $X | $X | I-Drive, 1 mi from Universal |
| Kayak | ... | $X | $X | $X | $X | Near Disney Springs |

## Step 4 — Save Results

Derive a folder-safe destination name from the destination input: lowercase, spaces replaced with hyphens (e.g. "San Diego, CA" → `san-diego-ca`).

### 4a — Write search results

Write results to `travel_plans/[destination-slug]/vacation_packages/processed=[YYYY-MM-DD]/results.md` (create directories if needed):

```
## Vacation Packages — Searched: [current date and time]

### Inputs
| Field | Value |
|---|---|
| Destination | [destination] |
| Origin | [departure city] |
| Check-in | [check-in date] |
| Check-out | [check-out date] |
| Travelers | [number] |
| Experiences | [comma-separated list of selected experiences] |

### Results
[paste the full results table here]
```

### 4b — Update summary.md

Update `travel_plans/[destination-slug]/summary.md` (create if it doesn't exist):
- Set the **Latest Prices** row for Vacation Packages to the best deal found today
- Append a new row to the **Price History > Vacation Packages** table with today's date, best deal, and the change vs. the previous search
- Add an entry to the Search History list pointing to the new processed directory
