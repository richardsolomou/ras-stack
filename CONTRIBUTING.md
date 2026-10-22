# Contributing to ras-stack

Install Node 24.x, pnpm 11.15.0, and Just 1.58.0, then run:

```sh
just install
just check
```

`just check` runs formatting, linting, shared-configuration resolution, type checking, unit tests, and the workspace builds. Unit tests enforce the coverage thresholds in `packages/ras-stack/vitest.config.ts`; raise a threshold when a change clears it rather than leaving new code untested.

`just check-actions` lints the shell scripts and workflow definitions the published actions ship. It needs ShellCheck and actionlint, which `mise install` provides at the versions pinned in `mise.toml`.

Repository release and dependency policies are committed and owned here. `just check` validates existing changesets without requiring a release for every edit.

Keep exports composable. Shared code may implement duplicated infrastructure mechanics, but applications retain direct access to upstream libraries and ownership of schemas, migrations, authorization, routes, plugins, domain events, and product policy. Prefer one independently useful function over a configuration facade for runtime behavior. The sync/update CLI owns selected dependency/tool versions and generated repository configuration; application behavior remains outside it. An extraction should remove concrete duplicate mechanics in two consumers, or protect a consequential security or lifecycle invariant in one. Preserve upstream objects, explain what code disappears, and identify the coordination that remains. Keep product policy local.

`build`, `changesets`, `managed`, `preview`, and `vite` are repository tooling and must stay out of the application modules, so an application never pulls CI-only code and its dependencies in through an import. A new module directory has to be classified either way before the boundary test passes.

The Vite integration uses upstream React, Tailwind, Nitro, and PostHog plugins as development dependencies for their types and real configuration tests. Managed consumers install those plugins only when selected. Plain libraries without RAS-owned configuration remain application dependencies. The Query development dependency supplies native types and real provider/cache tests; it is installed in consumers only when selected.

Every exported behavior needs a contract test, including the `ras` commands. Vitest runs `packages/ras-stack/src/**/*.test.ts` and `actions/**/*.test.ts`, so a test covering an action script can sit beside the script or with the module that owns it. Avoid runtime dependencies when a platform API or injected capability is sufficient.

Keep consumer names, repository revisions, and application-specific integration checks in the consuming repositories. Validate shared contracts here through the packed-package checks and the full-stack example; consumer migrations should test a packed candidate before the new version is published. `package:check` verifies managed bare imports, React identity across third-party peers and RAS hooks, compiler/linter execution, browser builds, configured Query defaults, independent workspace dependency versions, and clean frozen installation.

Workspace builds use direct development dependencies and bundled presets. Packed-package tests exercise synchronization, native frozen installs, production dependency pruning, and the complete upgrade command.

## Documentation ownership

The [documentation index](docs/README.md) owns the user-facing installation, configuration, CLI, upgrade, and dependency-management guides. Keep those contracts in RAS and link to them from consumer repositories. Consumer docs retain application-specific commands, ports, credentials, product behavior, and operating procedures. Candidate pins and temporary migration requirements belong in PR descriptions rather than permanent consumer guides.

When an integration changes, update its catalogue entry and the owning runtime or tooling guide. Keep each policy in one guide and link from other pages. Verify examples against the shipped descriptors, CLI behavior, and packed-package contract; do not present the workspace integration fixture as a generated managed consumer.

Consumer conformance tests must call the adapter or configuration actually used at startup. Passing a RAS factory directly into a RAS assertion cannot detect a disconnected application integration. Keep upstream defaults covered here and test routing, identity, tenant scope, lifecycle, and provider wiring in the application.

## Releases

Add a Changeset for each release-worthy package, action, or reusable-workflow change. `ras-stack` includes the integration catalogue and compiler/linter presets in one versioned package. Package releases use `v<version>` tags. The separate configuration package and its release tags are retired. The runtime binary image has its own release tags. The release workflow publishes each missing RAS version from a packed archive with provenance bound to the released commit.

A new npm package needs an initial manual publication before its trusted GitHub Actions publisher can be configured. Review and publish the packed archive, then configure `release.yml` as its trusted publisher. Never publish a workspace directory directly.

The shipped pnpm hook injects selected runtime/development packages into the root application manifest in memory and generates ignored local presets. The CLI configures that hook, refreshes bot policy, and delegates target-release execution and installation to pnpm. Keep the hook import graph free of third-party runtime dependencies: config-dependency boot installs do not install those packages. Runtime SDKs are optional peers; build tools resolve from the consuming application rather than becoming RAS runtime dependencies. `yaml` preserves existing workspace and Dependabot policy comments during CLI synchronization; explicit build approvals are applied by the hook. `import-meta-resolve` handles Node import conditions and export maps when loading application-owned build tools. Changesets uses its maintained parser and workspace packages directly. Keep the CLI free of dependency-resolution, link-repair, and lockfile-generation code.
