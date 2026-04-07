#!/usr/bin/env bash
# chacon-travel session startup: install Playwright deps if missing
if [ -d "${CLAUDE_PLUGIN_ROOT}/playwright" ] && [ ! -d "${CLAUDE_PLUGIN_ROOT}/playwright/node_modules" ]; then
  echo "[chacon-travel] Installing Playwright dependencies..."
  cd "${CLAUDE_PLUGIN_ROOT}/playwright" && npm install --silent
  echo "[chacon-travel] Playwright dependencies installed."
fi
