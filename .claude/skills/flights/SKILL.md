---
name: flights
description: Search travel sites for flights and return a cost comparison table. Use when the user wants to find flights, compare airfares, or look up flight prices between two cities.
---

Search travel sites for flights and return a cost comparison table, then save results.

When this skill is invoked:

## Step 1 — Collect Inputs

First, check whether `travel_plans/` exists and contains any destination folders.

- If **existing destination folders are found**, use AskUserQuestion to ask the user:
  - "Which destination would you like to search?" with one option per existing folder (using the folder name as the label) plus a "New destination" option
  - If they pick an existing destination, pre-fill the destination field from the folder name and skip asking for it again
  - If they pick "New destination", prompt for the destination as normal

Then collect any remaining missing details via AskUserQuestion:
- Origin city (departure airport or city)
- Destination city — skip if pre-filled from an existing folder
- Departure date (YYYY-MM-DD)
- Return date (YYYY-MM-DD)
- Number of travelers (exact whole number, e.g. 2, 3, 4)

## Step 2 — Search for Flights

### Step 2a — Run Playwright headless search

Use the Bash tool to run:

```
node playwright/search.js flights --origin "<ORIGIN>" --destination "<DESTINATION>" --depart <YYYY-MM-DD> --return <YYYY-MM-DD> --travelers <N>
```

This writes results to `travel_plans/[destination-slug]/flights/processed=[YYYY-MM-DD]/results.md` and updates `summary.md` automatically. Wait for the command to complete.

### Step 2b — Read results and identify gaps

Read the written `results.md` file. Identify any rows marked `N/A` or sites that returned an error.

### Step 2c — Fill gaps with Chrome MCP

> **Silent mode:** Execute all Chrome MCP browser steps without narrating individual actions (clicks, scrolls, typing). Use the tools quietly and only report the final prices found or a single error message if a site is blocked.

For each site with an N/A result, use `mcp__claude-in-chrome__*` tools to search that site in Chrome and retrieve results. Refer to the per-site navigation guides in `sites/` for UI steps:

1. **Google Flights** — https://www.google.com/travel/flights → `sites/google-flights.md`
2. **Southwest Airlines** — https://www.southwest.com → `sites/southwest.md`
3. **Expedia** — https://www.expedia.com/Flights → `sites/expedia.md`
4. **Kayak** — https://www.kayak.com/flights → `sites/kayak.md`

For each selected option, note:
- Airline(s)
- Departure and return times/duration
- Number of stops
- Price per person
- Total cost for the group

### Step 2d — Update results file with MCP data

If any MCP searches succeeded, edit `results.md` to replace the N/A rows with the new data.

For each site, find the top 1–2 highest-quality or most preferred flight options. Prioritize by:
1. **Fewest stops** (nonstop preferred over 1-stop; avoid 2+ stop itineraries unless nothing better exists)
2. **Reputable airline** (major carriers preferred over ultra-low-cost when price difference is modest)
3. **Reasonable travel times** (avoid red-eyes or excessively long layovers unless significantly cheaper)
4. **Best price** among options that meet the above criteria

If a site still cannot be searched after MCP attempt, leave it as "N/A" and continue.

## Step 3 — Output Results Table

Present the results as a markdown table:

| Site | Airline | Departure → Return | Stops | Per Person | Total (Group) |
|---|---|---|---|---|---|
| Google Flights | ... | ... | ... | $X | $X |
| Southwest | ... | ... | ... | $X | $X |
| Expedia | ... | ... | ... | $X | $X |
| Kayak | ... | ... | ... | $X | $X |

## Step 4 — Save Results

Derive a folder-safe destination name from the destination input: lowercase, spaces replaced with hyphens (e.g. "San Diego, CA" → `san-diego-ca`).

### 4a — Write search results

Write results to `travel_plans/[destination-slug]/flights/processed=[YYYY-MM-DD]/results.md` (create directories if needed):

```
## Flights — Searched: [current date and time]

### Inputs
| Field | Value |
|---|---|
| Origin | [origin city] |
| Destination | [destination city] |
| Departure | [departure date] |
| Return | [return date] |
| Travelers | [number] |

### Results
[paste the full results table here]
```

### 4b — Update summary.md

Update `travel_plans/[destination-slug]/summary.md` (create if it doesn't exist):
- Set the **Latest Prices** row for Flights to the best fare found today
- Append a new row to the **Price History > Flights** table with today's date, best fare, and the change vs. the previous search (or "first search" if none)
- Add an entry to the Search History list pointing to the new processed directory
