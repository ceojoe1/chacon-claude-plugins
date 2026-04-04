---
name: vacation-packages
description: Search for bundled flight + hotel vacation packages and return a cost estimate table. Use when the user wants to find vacation packages, travel bundles, or combined flight and hotel deals.
---

Search travel sites for bundled flight + hotel vacation packages, return a cost estimate table, and save results.

When this skill is invoked:

## Step 1 — Collect Inputs

First, check whether `travel_plans/` exists and contains any destination folders.

- If **existing destination folders are found**, use AskUserQuestion to ask the user:
  - "Which destination would you like to search?" with one option per existing folder (using the folder name as the label) plus a "New destination" option
  - If they pick an existing destination, pre-fill the destination field from the folder name and skip asking for it again
  - If they pick "New destination", prompt for the destination as normal

Then collect any remaining missing details via AskUserQuestion:
- Destination (city or area) — skip if pre-filled from an existing folder
- Departure city (origin for flights)
- Check-in date (YYYY-MM-DD)
- Check-out date (YYYY-MM-DD)
- Number of travelers (exact whole number, e.g. 2, 3, 4)

**Experiences** — ask the user which experiences they plan to attend, using multiSelect: true. Offer 3–4 destination-appropriate options based on the destination (e.g., for Orlando: Theme Parks, Disney World, Universal Studios, International Drive, Beaches). Always include an "Other / No preference" option. The user may select multiple.

Use the selected experiences to:
- Prioritize packages whose hotel is close to or affiliated with the chosen experiences (e.g., Disney-area resort for Disney World, I-Drive hotel for Universal)
- Note which packages include experience-relevant perks (park tickets, resort access, shuttle service)
- When comparing packages of similar price, prefer the one with better experience alignment

## Step 2 — Search Travel Sites

### Step 2a — Run Playwright headless search

Use the Bash tool to run:

```
node playwright/search.js vacation-packages --origin "<ORIGIN>" --destination "<DESTINATION>" --depart <YYYY-MM-DD> --return <YYYY-MM-DD> --travelers <N>
```

This writes results to `travel_plans/[destination-slug]/vacation_packages/processed=[YYYY-MM-DD]/results.md` and updates `summary.md` automatically. Wait for the command to complete.

### Step 2b — Read results and identify gaps

Read the written `results.md` file. Identify any rows marked `N/A` or sites that returned an error.

### Step 2c — Fill gaps with Chrome MCP

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
2. **Hotel quality** (prefer 4-star or highly rated properties over budget options)
3. **Flight quality** (nonstop or 1-stop preferred; major carriers over ultra-low-cost)
4. **Value** (best combined quality-to-price ratio)
5. **Included perks** (resort credits, breakfast, park tickets, free cancellation, shuttle service)

Avoid surfacing packages with low-rated hotels (below 7.0/10 or 3.5/5) unless nothing better is available.

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
