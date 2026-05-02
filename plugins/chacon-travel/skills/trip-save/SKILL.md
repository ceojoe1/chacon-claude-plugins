---
name: trip-save
description: Save a named trip definition (destination, dates, travelers, optional origin) so you can re-run all searches later with /trip-rerun. Use when the user wants to bookmark a trip for repeated price checks.
---

Save a trip definition so the user can re-run searches against it later with `/trip-rerun`.

## Step 1 — Collect Inputs

Use AskUserQuestion to collect any missing fields:

- **Trip name** — a label like "Databricks AI Summit 2026" (required)
- **Destination** — city, neighborhood, or address (required)
- **Origin city / airport** — optional; required only if the user wants to include flight searches when re-running
- **Departure / check-in date** — YYYY-MM-DD (required)
- **Return / check-out date** — YYYY-MM-DD (required)
- **Number of travelers** — default 1
- **Number of rooms** — default 1

## Step 2 — Save

Run via the Bash tool:

```
node --no-warnings "${CLAUDE_PLUGIN_ROOT}/playwright/trip.js" save \
  --name "<NAME>" \
  --destination "<DESTINATION>" \
  --depart <YYYY-MM-DD> --return <YYYY-MM-DD> \
  --travelers <N> --rooms <N> \
  [--origin "<ORIGIN>"]
```

## Step 3 — Confirm

Tell the user the trip was saved and that they can re-run it any time with `/trip-rerun "<NAME>"`. Mention `/trip-list` to see all saved trips.
