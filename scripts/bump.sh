#!/usr/bin/env bash
# Manually bump chacon-travel + marketplace version.
# Usage:  scripts/bump.sh [major|minor|patch]   (default: patch)

set -e

KIND="${1:-patch}"
PLUGIN_JSON="plugins/chacon-travel/.claude-plugin/plugin.json"
MARKETPLACE_JSON=".claude-plugin/marketplace.json"

if [ "$KIND" != "major" ] && [ "$KIND" != "minor" ] && [ "$KIND" != "patch" ]; then
  echo "Usage: $0 [major|minor|patch]"
  exit 1
fi

CURRENT=$(node -e "console.log(require('./$PLUGIN_JSON').version)")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT"

case "$KIND" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW="$MAJOR.$MINOR.$PATCH"
echo "[chacon-travel] Bumping version $CURRENT → $NEW ($KIND)"

node -e "
const fs = require('fs');
for (const f of ['$PLUGIN_JSON', '$MARKETPLACE_JSON']) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.version) j.version = '$NEW';
  if (j.metadata && j.metadata.version) j.metadata.version = '$NEW';
  if (j.plugins && j.plugins[0]) j.plugins[0].version = '$NEW';
  fs.writeFileSync(f, JSON.stringify(j, null, 2) + '\n');
}
"

echo "[chacon-travel] Updated $PLUGIN_JSON and $MARKETPLACE_JSON"
echo "[chacon-travel] Don't forget to add a CHANGELOG.md entry for $NEW."
