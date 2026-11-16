---
name: ci
version: 1
summary: Run `pnpm check` on every pull request and push to main through the shared workflow, with a grouped, cooled-down Dependabot policy.
requires: []
conflicts: []
dependencies: []
devDependencies: []
wires: []
---

# ci

## Use it when

The application lives on GitHub. Every application does; the recipe has no alternative.

## Decisions

- **One job that runs `pnpm check`.** The `tooling` recipe makes `pnpm check` run everything CI should, so CI and a local run cannot disagree. A recipe that adds a step, such as a build, extends `pnpm check` instead of adding a job. Add jobs here only for what does not belong in a local check, such as a browser suite through `check-browser.yml@v1` or an image build.
- **The shared `check-js.yml@v1` workflow, not inline steps.** It installs the Node and pnpm versions `package.json` declares, with a frozen lockfile and the pnpm cache, so a toolchain change is one edit in `package.json`. It also rejects a Dependabot branch that does not contain its pull request's base commit: Dependabot rebases lazily, and a green check on a stale lockfile can merge a combination of packages that was never tested together.
- **Follow the `v1` tag.** ras-stack advances `v1` only after a verified release and never breaks it, so applications get workflow fixes without pin bumps. Dependabot ignores ras-stack majors, because a new major needs a deliberate migration.
- **Pull requests, pushes to main, and manual runs; one run per branch.** A new push cancels the run it supersedes. Read-only `contents` permission; a job that needs more asks for it.
- **Dependabot proposes minor and patch updates of direct dependencies only.** Majors change APIs and need someone to read the release notes and migrate, so they are done by hand. The `update-types` restriction applies only to version updates, so security updates, majors and transitive ones included, still open.
- **Two groups: one patch PR and one minor PR a week.** One PR per package buried the queue and let packages that must move together, such as `better-auth` and its plugins, land apart. Splitting by update type keeps the low-risk patch PR mergeable when a minor bump breaks. The groups apply to version updates only, so a security update opens its own PR instead of waiting behind a grouped one that fails.
- **Seven-day cooldown, except PostHog.** A compromised or broken release is usually caught and pulled within days, so updates wait a week. PostHog is a trusted publisher whose SDK fixes should land the day they ship. The cooldown never delays security updates. It matches pnpm's `minimumReleaseAge` in the `tooling` recipe, which applies the same week to anything installed by hand.
- **Actions updates in one weekly PR.** Action majors are routine (`actions/checkout@v6` to `v7`) because tags are major-only, and they rarely interact, so one PR is enough review.
- **Container images are the deploy recipe's ecosystem.** `deploy-dokploy` adds Dependabot's `docker` ecosystem when it adds the Dockerfile, because an application without one would get a Dependabot error for a missing manifest every week.
- **No Changesets release.** Applications deploy from `main`, not from versions, so a version number and changelog are optional. An application that publishes releases adds a job calling `release-changesets.yml@v1` after `check` (see the [repository tooling guide](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md#release-workflows)); a deploy recipe that builds images from releases owns that job.

## Files

| File                       | Job                                                          |
| -------------------------- | ------------------------------------------------------------ |
| `.github/workflows/ci.yml` | Runs `pnpm check` through the shared `check-js.yml@v1`.      |
| `.github/dependabot.yml`   | Weekly grouped npm and GitHub Actions updates with cooldown. |

## Wiring

None. A recipe that adds a CI job lists `.github/workflows/ci.yml` in its `wires`. Name new jobs so `check` stays the required status check. A recipe that adds a dependency manifest Dependabot understands, such as a Dockerfile, lists `.github/dependabot.yml` and adds its ecosystem.

## Configuration

In the repository settings, require the `check / check` status check on `main` and enable Dependabot security updates.

## Verify

Open a pull request: the `check / check` job runs `pnpm check` and passes. `actionlint .github/workflows/ci.yml` reports nothing. Dependabot's **Insights > Dependency graph > Dependabot** tab shows every ecosystem with no configuration errors.
