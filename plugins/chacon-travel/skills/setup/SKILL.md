---
name: setup
description: First-time setup for chacon-travel. Copies the Playwright runtime into the current project and installs npm dependencies. Run once after installing the plugin.
---

Set up the chacon-travel Playwright runtime in the current project.

## Steps

1. Check if `./playwright/package.json` already exists in the current working directory.
   - If it does AND `./playwright/node_modules/` exists, tell the user setup is already complete and stop.
   - If `./playwright/package.json` exists but `node_modules` is missing, skip to step 3.

2. Copy the Playwright runtime from the plugin cache into the project:
   ```bash
   cp -r "${CLAUDE_PLUGIN_ROOT}/playwright" ./playwright
   ```
   Wait for the copy to complete before continuing.

3. Install npm dependencies:
   ```bash
   cd ./playwright && npm install
   ```
   Show the output. Wait for it to finish.

4. Confirm: "chacon-travel is ready. You can now use /chacon-travel:flights, /chacon-travel:hotels, /chacon-travel:vacation-packages, and /chacon-travel:search-all."

If any step fails, show the full error and tell the user what went wrong.
