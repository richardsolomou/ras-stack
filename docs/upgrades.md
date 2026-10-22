# Upgrades and dependency ownership

[Documentation](README.md) · [Installation](managed-installation.md) · [Configuration](configuration.md)

RAS owns compatible direct versions and configuration for selected capabilities. pnpm owns dependency resolution, integrity checks, registry authentication, installation, and the consumer lockfile. Plain libraries and product-specific configuration remain application-owned.

## Change selections

Edit `ras.config.ts`, then run:

```sh
pnpm exec ras sync
```

Review and commit changes to the ordinary dependency groups, `ras.managedDependencies`, `.ras/`, applicable policy files, and `pnpm-lock.yaml`. Run the application's checks. `sync --check` is read-only and belongs in CI; it does not apply changed selections.

## Upgrade the stack

```sh
pnpm exec ras update
```

The default target is `latest`. An explicit version or tag chooses another release:

```sh
pnpm exec ras update next
```

The installed CLI delegates to `pnpm dlx ras-stack@<target> sync --upgrade`. The target release supplies the catalogue and presets, pins its own exact RAS version, updates the selected dependencies, and runs installation with lockfile updates allowed. One command prepares the coordinated change; review its diff and run application checks before merging.

A plain `pnpm update ras-stack` changes the package without synchronizing its managed entries. Use `ras update` for coordinated upgrades. Normal clones and CI continue to use native frozen installs.

## Opt out or transfer ownership

`package.json` contains a generated `ras.managedDependencies` array. It stores package names only. The actual versions stay in ordinary dependency groups; configuration stays in `ras.config.ts` and the bundled presets.

When a selection is removed, sync removes packages previously owned by RAS unless another selection still needs them. Unrelated application dependencies are preserved. Do not remove the tracking list during a normal opt-out: RAS needs it to distinguish previously managed packages from application-owned ones.

To keep a package while transferring it to the application, remove the selecting descriptor and remove that package's name from `ras.managedDependencies` before syncing. If another remaining descriptor selects it, RAS still owns it. Review the remaining dependency group/version and take responsibility for its configuration and future upgrades.

Sync preserves an installed same-version RAS specifier, allowing a range, packed archive, or Git candidate to remain intact during ordinary synchronization. Bootstrapping with another release and `ras update` pin the executing release's version. pnpm continues to own the only lockfile; application-owned updates can move shared transitives even when managed direct versions stay fixed.

## Installation policy

Sync preserves existing registries, release-age restrictions, integrity checks, build approvals, schedules, and update groups. Explicitly requested `allowBuilds` entries can add reviewed approvals. A conflicting direct override or an explicit build denial fails before managed files are written.

For a deliberately reviewed candidate, an exact exception can coexist with a seven-day gate:

```yaml
minimumReleaseAge: 10080
minimumReleaseAgeExclude:
  - ras-stack@5.0.0-next.1
```

Use the version actually reviewed and retain unrelated policy entries. When moving between fresh releases, retain an existing exception until its old lockfile entry has been pruned, then remove it. RAS does not switch off a repository's gate to install itself.

Selected packages can need their own reviewed build approval, for example `allowBuilds: ['better-sqlite3']` with `sqlite`. RAS does not blanket-approve transitive install scripts. Compatibility-sensitive transitive overrides belong in the release or application that needs them; there is no universal RAS transitive snapshot.

## Dependabot and security updates

For existing npm update rules covering `/` in `.github/dependabot.yml` or `.yaml`, sync maintains ignored names for RAS and its managed selections. Generated entries carry `Managed by RAS.` comments; handwritten rules, schedules, groups, and other ecosystems remain intact. Sync does not enable Dependabot in repositories without it.

RAS and managed packages require coordinated upgrades. Dependabot remains responsible for application-owned packages outside the ignores. Vulnerability alerts remain visible, but managed security fixes need a RAS release or a deliberate transfer to application ownership; ignoring update PRs does not resolve vulnerabilities.

Ignores apply across the entire matching update rule, including the same names in other workspace manifests. This can affect separately owned React or TypeScript declarations. Decide the bot's rule boundaries explicitly when workspace packages need independent upgrades; sync itself does not force those packages onto the root's versions.

## Prerelease candidates

During the v5 prerelease, bootstrap with `pnpm dlx ras-stack@next sync` and update with `pnpm exec ras update next`. Do not use an unqualified `ras update` when `latest` still identifies v4.

The published `5.0.0-next.1` candidate supports ordinary frozen CI installs and `ras sync --check`. Prepare its mutable sync/update changes outside CI: that candidate inherits pnpm's CI frozen-lockfile default. The v5 implementation documented here explicitly allows lockfile writes for mutable commands.

Packed archives can be installed as ordinary dependencies and synchronized through their installed CLI. Git dependencies need RAS's standard `prepare` build and a source-scoped build approval; they cannot supply built output to a fresh install with scripts disabled. Use a built archive or published candidate when validating production installs with `--ignore-scripts`.

Candidate pins and stable-release merge requirements belong in migration PR descriptions. Consumers' permanent docs link to these guides rather than recording the temporary rollout.

## Migrate from v4

1. Remove `ras-stack-config` from the application manifest. Its compiler/linter presets and publishing path are retired; they ship in `ras-stack` v5.
2. Keep product libraries and application overrides. Select equivalent integrations/tools in a root `ras.config.ts` using the [catalogue](configuration.md).
3. Bootstrap with the target v5 release's `sync` command. RAS adopts selected packages into their runtime/development groups and records their ownership.
4. Replace compiler/linter references to `ras-stack-config` with `.ras/tsconfig.json` and `.ras/oxlint.json`. Keep local includes, aliases, rules, and exceptions as shown in [configuration](configuration.md#local-compiler-and-linter-settings).
5. Compose Vite overrides with `defineViteConfig` if selected presets should apply. Remove duplicated managed plugins and stylesheet imports while retaining application-specific plugins and runtime/provider composition.
6. Commit `.ras/` and include it in container build contexts. Remove abandoned experimental dependency-injection hooks/config-dependency settings, if present; preserve unrelated pnpm policy.
7. Add `ras sync --check` after the ordinary frozen CI install. Review bot policy, upstream API compatibility, application builds, tests, and the affected runtime flows.

The in-repository full-stack example tests runtime helpers through `workspace:*` and maintains its own direct dependency manifest. The packed-package checks exercise the external managed-installation contract. The example is not a generated managed consumer or a template for copying repository-specific version policy.

## Troubleshooting

| Symptom                                                   | Action                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Run ras sync; managed files are out of date`             | Run the installed release's sync locally, review generated files, and commit them                                         |
| Selected package is not installed at the expected version | Synchronize/install instead of independently updating its manifest entry                                                  |
| Release-age or build-policy rejection                     | Review the exact rejected entry and repository policy; retry after an intentional policy change or after the release ages |
| Frozen install rejects the lockfile                       | Check that synchronized manifests and their resulting lockfile were committed together                                    |
| Conflicting override or denied build                      | Reconcile the explicit local policy with the selection; sync does not silently override it                                |
| `.ras` is treated as consumer-owned                       | Inspect the directory and generated marker before replacing anything; do not delete application-owned data                |
| Wrong workspace package is being changed                  | Run from the owning pnpm workspace root; other package manifests remain independent                                       |

An install failure leaves ordinary, reviewable files. Correct the cause and rerun the same sync/update command, including the same target release for a failed upgrade. Avoid concurrent sync/update commands in one checkout. Check failures and normal tool commands do not repair state implicitly.
