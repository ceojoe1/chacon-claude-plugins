# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in `chacon-claude-plugins`, please report it privately rather than opening a public issue.

**Preferred channel:** [GitHub private vulnerability reporting](https://github.com/ceojoe1/chacon-claude-plugins/security/advisories/new).

If that's not available, you can email the maintainer at the address listed on the [GitHub profile](https://github.com/ceojoe1).

When reporting, please include:

- A description of the issue and its potential impact
- Steps to reproduce
- The version (`plugin.json` → `version`) you're running
- Your environment (OS, Node.js version, Claude Code version)

You can expect an initial acknowledgement within a few days. We'll work with you to confirm the issue, develop a fix, and coordinate disclosure.

## Scope

In scope:

- The `chacon-travel` plugin code in `plugins/chacon-travel/`
- The shared marketplace metadata in `.claude-plugin/`
- Build and packaging scripts in `scripts/`

Out of scope:

- Vulnerabilities in upstream dependencies (please report to the upstream project; we'll bump the dependency once a fix is available)
- Vulnerabilities in Claude Code itself or in the Anthropic SDK (report to Anthropic)
- Issues that require a malicious local user with shell access to the machine running the plugin

## Supported versions

Only the latest minor version on the `master` branch receives security fixes. If a fix needs to land on an older release, that will be evaluated case-by-case.

## Repository hardening

This repository has the following protections enabled:

- **Secret scanning** — GitHub scans pushes for known credential patterns. Push protection is enabled to block commits containing detected secrets before they reach the remote.
- **Dependabot** — automatic security updates for npm dependencies and GitHub Actions (see `.github/dependabot.yml`).
- **Pinned GitHub Actions** — third-party actions in CI workflows are pinned to commit SHAs (see `.github/workflows/`).
- **CodeQL** — recommended; enable via *Settings → Code security and analysis* if not already on.
- **Branch protection on `master`** (required, configured in repo settings):
  - All changes must arrive via pull request — direct pushes to `master` are blocked.
  - Pull requests require at least one approving review from the maintainer (@ceojoe1) before merge.
  - CI status checks (`Syntax + manifest checks`) must pass before merge.
  - Force pushes and branch deletion are disallowed.
  - Branch protection applies to administrators (no bypass).
  - Require linear history (no merge commits) — keeps git log readable.

## Credentials and PII

This plugin runs headless browser searches against public travel sites and writes results to a local SQLite database inside the plugin install directory. **It does not collect, transmit, or store any user credentials.** It uses no API keys.

The geocoding helper queries the public OpenStreetMap Nominatim service with hotel addresses; no personal data is sent.
