---
name: travel-setup
description: First-time setup for chacon-travel. Copies the Playwright runtime and MCP server into the current project, installs npm dependencies, and registers the travel DB MCP server. Run once after installing the plugin.
---

Set up the chacon-travel Playwright runtime and MCP server in the current project.

## Steps

### Step 0 — Dependency check

0. Verify that `npm` is available:
   ```bash
   npm --version
   ```
   - If the command succeeds, continue to Step 1.
   - If it fails (command not found), install Node.js + npm via the platform-appropriate method:
     - **Windows:** `winget install OpenJS.NodeJS.LTS`
     - **macOS:** `brew install node`
     - **Linux:** `curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt-get install -y nodejs`

   After installing, verify again with `npm --version`. If it still fails, stop and tell the user:
   > "Could not install npm automatically. Please install Node.js from https://nodejs.org and re-run /travel-setup."

### Step 1 — Playwright runtime

1. Check if `./playwright/package.json` already exists in the current working directory.
   - If it does AND `./playwright/node_modules/` exists, skip to Step 2.
   - If `./playwright/package.json` exists but `node_modules` is missing, skip to sub-step 1c.

   **1b.** Copy the Playwright runtime from the plugin cache:
   ```bash
   cp -r "${CLAUDE_PLUGIN_ROOT}/playwright" ./playwright
   ```

   **1c.** Install npm dependencies:
   ```bash
   cd ./playwright && npm install
   ```
   Show the output. Wait for it to finish.

### Step 2 — MCP server

2. Check if `./mcp/travel-db.js` already exists.
   - If it does, skip to Step 3 (already set up).

   **2b.** Copy the MCP server from the plugin cache:
   ```bash
   cp -r "${CLAUDE_PLUGIN_ROOT}/mcp" ./mcp
   ```

### Step 3 — Register MCP in `.mcp.json`

3. Read `.mcp.json` in the current working directory (it may not exist yet).

   - If it doesn't exist, create it with:
     ```json
     {
       "mcpServers": {
         "chacon-travel-db": {
           "command": "node",
           "args": ["./mcp/travel-db.js"]
         }
       }
     }
     ```

   - If it exists, parse the JSON, check whether `mcpServers.chacon-travel-db` is already present:
     - If already present, skip this step.
     - If not present, add the entry under `mcpServers` and write the file back.

### Step 4 — Register permissions in `.claude/settings.json`

4. Read `.claude/settings.json` in the current working directory (it may not exist yet).

   The required allow entries for chacon-travel are:
   ```json
   "Bash(ls:*)",
   "Bash(test -d:*)",
   "Bash(find:*)",
   "Bash(node playwright/search.js:*)"
   ```

   - If `.claude/settings.json` doesn't exist, create `.claude/` if needed, then create the file:
     ```json
     {
       "permissions": {
         "allow": [
           "Bash(ls:*)",
           "Bash(test -d:*)",
           "Bash(find:*)",
           "Bash(node playwright/search.js:*)"
         ]
       }
     }
     ```

   - If it exists, parse the JSON:
     - Ensure `permissions.allow` exists (create it as an empty array if not).
     - For each of the 4 entries above, add it only if not already present.
     - Write the file back.

### Step 5 — Confirm

5. Tell the user:
   > "chacon-travel is ready.
   > - Skills: /flights, /hotels, /vacation-packages, /search-all
   > - MCP: `chacon-travel-db` registered in .mcp.json — **restart Claude Code** to activate the travel DB query tools.
   > - Permissions: bash allow-list updated in .claude/settings.json — no more prompts for directory checks and search commands."

If any step fails, show the full error and tell the user what went wrong.
