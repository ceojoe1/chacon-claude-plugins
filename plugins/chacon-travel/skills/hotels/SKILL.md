---
name: hotels
description: Search travel sites for hotels and vacation rentals and return a cost comparison table. Use when the user wants to find hotels, vacation rentals, or compare lodging options for a trip.
---

Search travel sites for hotels and vacation rentals, return a cost comparison table, then save results.

When this skill is invoked:

## Step 1 — Collect Inputs

First, call the `mcp__chacon-travel-db__get_trips` tool to retrieve stored trips from the database.

- If **trips are returned**, use AskUserQuestion to ask the user:
  - "Which trip would you like to search hotels for?" with one option per trip (label format: `[destination] — [check-in] to [check-out], [N] travelers`) plus a "New trip" option
  - If they pick an existing trip, pre-fill destination, check-in, check-out, and traveler count from that trip record — skip asking for those fields
  - If they pick "New trip", prompt for all details as normal

Then collect any remaining missing details via AskUserQuestion:
- Destination / neighborhood / property name — skip if pre-filled from a stored trip
- Check-in date (YYYY-MM-DD) — skip if pre-filled
- Check-out date (YYYY-MM-DD) — skip if pre-filled
- Number of guests — skip if pre-filled
- Number of rooms (default 1 if not specified)

**Experiences** — ask the user which experiences they plan to attend, using multiSelect: true. Offer 3–4 destination-appropriate options based on the destination (e.g., for Orlando: Theme Parks, Disney World, Universal Studios, International Drive, Beaches). Always include an "Other / No preference" option. The user may select multiple.

Use the selected experiences to:
- Prioritize hotels that are close to or affiliated with the chosen experiences (e.g., Disney-area resorts for Disney World, beachfront for beaches)
- Note distance or relevance to each experience in the results
- Filter out properties that are far from all selected experiences when better options exist

## Step 2 — Search for Hotels and Rentals

### Step 2a — Run Playwright headless search

Use the Bash tool to run:

```
node playwright/search.js hotels --destination "<DESTINATION>" --depart <YYYY-MM-DD> --return <YYYY-MM-DD> --travelers <N> --rooms <N>
```

This writes results to `travel_plans/[destination-slug]/hotels/processed=[YYYY-MM-DD]/results.md` and updates `summary.md` automatically. Wait for the command to complete.

### Step 2b — Read results and identify gaps

Read the written `results.md` file. Identify any rows marked `N/A` or sites that returned an error.

### Step 2c — Fill gaps with Chrome MCP

> **Silent mode:** Execute all Chrome MCP browser steps without narrating individual actions (clicks, scrolls, typing). Use the tools quietly and only report the final prices found or a single error message if a site is blocked.

For each site with an N/A result, use `mcp__claude-in-chrome__*` tools to search that site in Chrome and retrieve results. Refer to the per-site navigation guides in `sites/` for UI steps:

1. **Google Hotels** — https://www.google.com/travel/hotels → `sites/google-hotels.md`
2. **Expedia** — https://www.expedia.com/Hotels → `sites/expedia.md`
3. **Kayak** — https://www.kayak.com/hotels → `sites/kayak.md`
4. **Costco Travel** — https://www.costcotravel.com/Hotels → `sites/costco-travel.md`
5. **VRBO** — https://www.vrbo.com → `sites/vrbo.md`
6. **Airbnb** — https://www.airbnb.com → `sites/airbnb.md`

For each selected option, note:
- Property name
- Type (Hotel / Condo / Vacation Rental)
- Star rating or guest rating
- Price per night
- Total cost for the full stay
- Proximity or relevance to selected experiences (e.g., "On-site Disney access", "0.5 mi from Universal", "Beachfront")
- Direct link to the listing (if visible)

### Step 2d — Update results file with MCP data

If any MCP searches succeeded, edit `results.md` to replace the N/A rows with the new data.

For each site, find the top **1–4** highest-quality or most preferred options. Prioritize by:
1. **Experience alignment** — properties close to or purpose-built for the selected experiences rank first
2. **Amenities** — must have pool; prefer properties that also offer a gym, on-site family dining or a quality restaurant, and resort-style perks (spa, concierge, kids' club, free breakfast). Flag these in results.
3. **Guest rating** (target 8.5+/10 on Expedia/Kayak, 4.3+/5 on Google — mid-tier minimum)
4. **Star class** (4-star and above preferred; 3-star only if ratings and amenities are exceptional)
5. **Value** (best quality-to-price ratio within mid/upper tier)

**Skip** properties that: are below 4-star or 8.0/10, lack a pool, or are clearly budget/economy class (e.g. motels, hostels, extended-stay). If a site returns only budget options, note it rather than surfacing low-quality results.

If a site still cannot be searched after MCP attempt, leave it as "N/A" and continue.

## Step 3 — Output Results Table

Present the results as a markdown table (up to **8 best options** across all sites, prioritized by experience alignment):

| Site | Property | Type | Rating | Per Night | Total Stay | Experience Fit | Link |
|---|---|---|---|---|---|---|---|
| Google Hotels | ... | Hotel | ⭐4.5 | $X | $X | Disney area, 0.2 mi to park | [Book](#) |
| Costco Travel | ... | Hotel | ⭐4.2 | $X | $X | I-Drive, near Universal | [Book](#) |
| VRBO | ... | Vacation Rental | ⭐4.8 | $X | $X | Disney Springs area | [Book](#) |
| Airbnb | ... | Condo | ⭐4.7 | $X | $X | Near Universal | [Book](#) |

## Step 4 — Save Results

Derive a folder-safe destination name from the destination input: lowercase, spaces replaced with hyphens (e.g. "San Diego, CA" → `san-diego-ca`).

### 4a — Write search results

Write results to `travel_plans/[destination-slug]/hotels/processed=[YYYY-MM-DD]/results.md` (create directories if needed):

```
## Hotels — Searched: [current date and time]

### Inputs
| Field | Value |
|---|---|
| Destination | [destination] |
| Check-in | [check-in date] |
| Check-out | [check-out date] |
| Guests | [number] |
| Rooms | [number] |
| Experiences | [comma-separated list of selected experiences] |

### Results
[paste the full results table here]
```

### 4b — Update summary.md

Update `travel_plans/[destination-slug]/summary.md` (create if it doesn't exist):
- Set the **Latest Prices** row for Hotels to the best rate found today
- Append a new row to the **Price History > Hotels** table with today's date, best rate, and the change vs. the previous search
- Add an entry to the Search History list pointing to the new processed directory
