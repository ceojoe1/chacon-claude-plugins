---
name: trip-list
description: List all saved trips in the chacon-travel database with their destinations, dates, traveler counts, and last-search timestamps. Use when the user wants to see what trips they have bookmarked.
---

Show all saved trips.

## Step 1 — Run

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/trip.js" list
```

## Step 2 — Present

Forward the output as-is. If the list is empty, suggest `/trip-save` to create one. If trips are listed, mention the user can re-run any of them with `/trip-rerun "<NAME>"`.
