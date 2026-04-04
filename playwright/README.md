# vacAI Playwright — Headless Travel Search

Runs travel searches headlessly and writes results to `travel_plans/` in the same format as the Claude-in-Chrome skills.

## Prerequisites

- Node.js 18+
- Run `npm install` once from this directory

## Usage

```bash
# From the repo root:
node playwright/search.js flights --origin ABQ --destination "Orlando, FL" --depart 2026-07-10 --return 2026-07-17 --travelers 4

node playwright/search.js hotels --destination "Orlando, FL" --depart 2026-07-10 --return 2026-07-17 --travelers 4

node playwright/search.js vacation-packages --origin ABQ --destination "Orlando, FL" --depart 2026-07-10 --return 2026-07-17 --travelers 4
```

Add `--headed` to any command to open a visible browser (useful for debugging).

## Scheduling with Windows Task Scheduler

1. Edit `run-weekly.bat` to set your trip dates, origin, and destination.

2. Register the task (run once in an admin terminal):

```bat
schtasks /create /tn "vacAI Weekly Search" /tr "cmd /c C:\Users\ceojo\Documents\Projects\vacAI\playwright\run-weekly.bat" /sc WEEKLY /d MON /st 06:00 /ru %USERNAME% /f
```

3. To run immediately:
```bat
schtasks /run /tn "vacAI Weekly Search"
```

4. To delete the task:
```bat
schtasks /delete /tn "vacAI Weekly Search" /f
```

Logs are written to `playwright/logs/` (gitignored).

## Notes

- Sites run sequentially to reduce bot-detection risk
- Costco Travel is blocked from automated access — will be marked N/A
- Kayak may show CAPTCHAs — will be marked N/A if detected
- Run with `--headed` if a site is consistently failing to debug the UI
