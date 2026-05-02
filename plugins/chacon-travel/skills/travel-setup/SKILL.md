---
name: travel-setup
description: First-time setup for chacon-travel. Installs Playwright dependencies inside the plugin directory and registers the travel DB MCP server at an absolute path. Run once after installing the plugin.
---

Set up the chacon-travel Playwright runtime and MCP server. The plugin runs in-place from `${CLAUDE_PLUGIN_ROOT}` — nothing is copied into the user's project.

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

### Step 1 — Install Playwright dependencies in plugin

1. Check whether `${CLAUDE_PLUGIN_ROOT}/playwright/node_modules/` exists:
   ```bash
   test -d "${CLAUDE_PLUGIN_ROOT}/playwright/node_modules"
   ```
   - If it exists, skip to Step 2 (already installed).
   - Otherwise install:
     ```bash
     cd "${CLAUDE_PLUGIN_ROOT}/playwright" && npm install
     ```
     Show the output. Wait for it to finish.

### Step 2 — Register MCP in `.mcp.json`

2. Read `.mcp.json` in the current working directory (it may not exist yet).

   The MCP entry uses an **absolute path** so the server runs from the plugin install location regardless of the user's cwd. Resolve `${CLAUDE_PLUGIN_ROOT}` first via `echo "${CLAUDE_PLUGIN_ROOT}"` and substitute it into the JSON.

   - If `.mcp.json` doesn't exist, create it with:
     ```json
     {
       "mcpServers": {
         "chacon-travel-db": {
           "command": "node",
           "args": ["<ABSOLUTE_PLUGIN_ROOT>/mcp/travel-db.js"]
         }
       }
     }
     ```

   - If it exists, parse the JSON. Check whether `mcpServers.chacon-travel-db` is already present:
     - If already present AND the args path is current (matches `${CLAUDE_PLUGIN_ROOT}/mcp/travel-db.js`), skip.
     - Otherwise add or update the entry under `mcpServers` and write the file back.

### Step 3 — Register permissions in `.claude/settings.json`

3. Read `.claude/settings.json` in the current working directory (it may not exist yet).

   The required allow entries are:
   ```json
   "Bash(node:*)",
   "Bash(test -d:*)"
   ```

   - If `.claude/settings.json` doesn't exist, create `.claude/` if needed, then create the file:
     ```json
     {
       "permissions": {
         "allow": [
           "Bash(node:*)",
           "Bash(test -d:*)"
         ]
       }
     }
     ```

   - If it exists, parse the JSON:
     - Ensure `permissions.allow` exists (create as empty array if not).
     - For each entry above, add it only if not already present.
     - Write the file back.

### Step 4 — Confirm

4. Tell the user:
   > "chacon-travel is ready.
   > - Skills: /flights, /hotels, /vacation-packages, /search-all
   > - MCP: `chacon-travel-db` registered in .mcp.json — **restart Claude Code** to activate the travel DB query tools.
   > - All data (results, DB) is stored inside the plugin directory; nothing is written to your project."

If any step fails, show the full error and tell the user what went wrong.
