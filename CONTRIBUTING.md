# Contributing to chacon-claude-plugins

Thanks for your interest in improving the plugin. This document covers the basics for filing issues, making changes, and shipping a release.

## Filing issues

- **Bug?** Use the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.md) template. Include the plugin version (`plugin.json` → `version`), Node.js version, and OS. Logs from the failing scraper run help a lot.
- **Feature request?** Use the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.md) template. Be specific about the use case.
- **Security?** See [SECURITY.md](SECURITY.md) — please report privately, not as a public issue.

## Setting up a development environment

```bash
git clone https://github.com/ceojoe1/chacon-claude-plugins.git
cd chacon-claude-plugins/plugins/chacon-travel/playwright
npm install
```

You'll need **Node.js 22.5 or newer** (the plugin uses the built-in `node:sqlite` API).

To test a search end-to-end:

```bash
node --no-warnings ./search.js hotels \
  --destination "Powell St, San Francisco, CA" \
  --depart 2026-06-14 --return 2026-06-18 \
  --travelers 1 --rooms 1 \
  --sites "Google Hotels" --max-hotels 2
```

Results land in `<repo>/plugins/chacon-travel/data/vacai.db`.

## Adding or fixing a scraper

Each travel site has its own module under `plugins/chacon-travel/playwright/<category>/`. Use existing scrapers as templates. The general flow:

1. Build the search URL with as many filters as the site supports.
2. Use `humanDelay` and `detectCaptcha` from `sites/helpers.js` for stealth.
3. Return either `{ site, results: [...] }` or `{ site, error: '...' }`.
4. Register the new scraper in `playwright/search.js` under the right category.

For tricky sites, drop a markdown note under `debugging/` documenting the page structure and any quirks (the Google Hotels notes are a good reference).

## Making a change

> **All changes go through a pull request.** Direct pushes to `master` are blocked by branch protection. Only the repository maintainer (@ceojoe1) merges PRs after review.

1. Fork the repository (or create a branch if you have write access).
2. Make your change on a feature branch off `master`. Keep diffs focused — one logical change per PR.
3. **Update the README.** It is the user-facing source of truth and must reflect anything that changes:
   - new or removed skills (the `What you get` table)
   - new or removed CLI flags
   - changes to install / setup flow
   - changes to where data is stored
   - new requirements (Node version, env vars, system tools)
   - changed query tools exposed by the MCP server
   PRs that change user-visible behavior without a matching README update will be asked to amend before merge.
4. Update the relevant skill `SKILL.md` if you change how that skill prompts, runs, or summarizes.
5. Add a `CHANGELOG.md` entry under `## [Unreleased]` (create that section at the top if it doesn't exist).
6. Open a pull request against `master`. CI must pass and the maintainer must approve before merge.

The pre-commit hook (installed via `bash scripts/install-hooks.sh`) auto-bumps the patch version when plugin files change. For minor or major bumps, run `scripts/bump.sh minor` or `scripts/bump.sh major` manually.

## Releasing

1. Move the `## [Unreleased]` notes in `CHANGELOG.md` under a new version heading with today's date.
2. Confirm `plugin.json` and `marketplace.json` versions match (the bump scripts keep them in sync).
3. Tag the release: `git tag v$(node -e "console.log(require('./plugins/chacon-travel/.claude-plugin/plugin.json').version)")` and push the tag.

## Code style

- ESM modules everywhere (the `package.json` declares `"type": "module"`).
- No external test framework yet — please add unit tests if you introduce a new pure-function helper.
- Comments explain *why* something is non-obvious (a workaround, a constraint), not *what* the code does.

## Code of conduct

Participation in this project is governed by the [Contributor Covenant](CODE_OF_CONDUCT.md).
