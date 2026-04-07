#!/usr/bin/env bash
# Install chacon-travel git hooks into the current repo's .git/hooks/

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOKS_DIR="$(git -C "$SCRIPT_DIR" rev-parse --git-dir)/hooks"

install_hook() {
  local name="$1"
  local src="$SCRIPT_DIR/$name"
  local dst="$HOOKS_DIR/$name"

  if [ ! -f "$src" ]; then
    echo "[install-hooks] Missing source: $src — skipping"
    return
  fi

  if [ -f "$dst" ] && ! grep -q "chacon-travel" "$dst"; then
    echo "[install-hooks] WARNING: $name already exists and was not created by this script — skipping to avoid overwrite"
    return
  fi

  cp "$src" "$dst"
  chmod +x "$dst"
  echo "[install-hooks] Installed $name"
}

install_hook "pre-commit"
install_hook "prepare-commit-msg"

echo "[install-hooks] Done."
