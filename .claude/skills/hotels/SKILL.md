---
name: hotels
description: Search travel sites for hotels and vacation rentals and return a cost comparison table. Use when the user wants to find hotels, vacation rentals, or compare lodging options for a trip.
---

Search travel sites for hotels and vacation rentals, return a cost comparison table, then save results.

When this skill is invoked:

## Step 1 — Collect Inputs

First, check whether `travel_plans/` exists and contains any destination folders.

- If **existing destination folders are found**, use AskUserQuestion to ask the user:
  - "Which destination would you like to search?" with one option per existing folder (using the folder name as the label) plus a "New destination" option
  - If they pick an existing destination, pre-fill the destination field from the folder name and skip asking for it again
  - If they pick "New destination", prompt for the destination as normal

Then collect any remaining missing details via AskUserQuestion:
- Destination / neighborhood / property name — skip if pre-filled from an existing folder
- Check-in date (YYYY-MM-DD)
- Check-out date (YYYY-MM-DD)
- Number of guests
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
2. **Guest rating** (highest rated first — e.g. 8.5+ on Expedia/Kayak, 4.5+/5 on Google)
3. **Star class** (prefer 3-star and above when available at reasonable price)
4. **Value** (best rating-to-price ratio)

Avoid surfacing low-rated properties (below 7.0/10 or 3.5/5) unless nothing better is available.

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
