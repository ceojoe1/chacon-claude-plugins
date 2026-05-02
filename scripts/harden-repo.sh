#!/usr/bin/env bash
# One-time repository hardening via the GitHub CLI.
# Run after `gh auth login`. Requires admin permission on the repo.
#
# Configures:
#   - Branch protection on master (PR required, CI required, no force push)
#   - Secret scanning + push protection
#   - Dependabot alerts + security updates
#   - Vulnerability alerts

set -e

REPO="${REPO:-ceojoe1/chacon-claude-plugins}"
BRANCH="${BRANCH:-master}"
CI_CHECK="${CI_CHECK:-Syntax + manifest checks}"

echo "=== Hardening $REPO ==="

# ── Branch protection on master ──────────────────────────────────────────────
echo "→ Setting branch protection on $BRANCH..."
gh api -X PUT "repos/$REPO/branches/$BRANCH/protection" \
  --input - <<JSON
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["$CI_CHECK"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true
}
JSON
echo "  ✓ Branch protection configured."

# ── Secret scanning + push protection + dependabot ───────────────────────────
echo "→ Enabling secret scanning, push protection, dependabot..."
gh api -X PATCH "repos/$REPO" \
  -f "security_and_analysis[secret_scanning][status]=enabled" \
  -f "security_and_analysis[secret_scanning_push_protection][status]=enabled" \
  -f "security_and_analysis[dependabot_security_updates][status]=enabled"
echo "  ✓ Secret scanning + push protection + Dependabot security updates enabled."

# ── Vulnerability alerts (Dependabot alerts) ─────────────────────────────────
echo "→ Enabling vulnerability alerts..."
gh api -X PUT "repos/$REPO/vulnerability-alerts"
echo "  ✓ Vulnerability alerts enabled."

# ── Automated security fixes ─────────────────────────────────────────────────
echo "→ Enabling automated security fixes..."
gh api -X PUT "repos/$REPO/automated-security-fixes"
echo "  ✓ Automated security fixes enabled."

echo ""
echo "Done. Verify in the GitHub UI: https://github.com/$REPO/settings/security_analysis"
