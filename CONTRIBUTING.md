# Contributing to ras-stack

Install Node 24.x, pnpm 11.15.0, and Just 1.58.0, then run:

```sh
just install
just check
```

`just check` runs formatting, linting, shared-configuration resolution, type checking, unit tests, and the workspace builds. Unit tests enforce the coverage thresholds in `packages/ras-stack/vitest.config.ts`; raise a threshold when a change clears it rather than leaving new code untested.

`just check-actions` lints the shell scripts and workflow definitions the published actions ship. It needs ShellCheck and actionlint, which `mise install` provides at the versions pinned in `mise.toml`.

Repository release and dependency policies are committed and owned here. `just check` validates existing changesets without requiring a release for every edit.

Keep exports composable. Shared code may implement duplicated infrastructure mechanics, but applications retain direct access to upstream libraries and ownership of schemas, migrations, authorization, routes, plugins, domain events, and product policy. Prefer one independently useful function over a configuration facade. An extraction should remove concrete duplicate mechanics in two consumers, or protect a consequential security or lifecycle invariant in one. Preserve upstream objects, explain what code disappears, and identify the coordination that remains. Keep product policy local.

`build`, `changesets`, and `preview` are repository tooling and must stay out of the application modules, so an application never pulls CI-only code and its dependencies in through an import. A new module directory has to be classified either way before the boundary test passes.

Every exported behavior needs a contract test, including the `ras` commands. Vitest runs `packages/ras-stack/src/**/*.test.ts` and `actions/**/*.test.ts`, so a test covering an action script can sit beside the script or with the module that owns it. Avoid runtime dependencies when a platform API or injected capability is sufficient.

Keep consumer names, repository revisions, and application-specific integration checks in the consuming repositories. Validate shared contracts here through the packed-package checks and the full-stack example; consumer migrations should test a packed candidate before the new version is published.

## Releases

Add a Changeset for each release-worthy package, action, or reusable-workflow change. `ras-stack` and `ras-stack-config` version independently. Runtime package releases use `v<version>` tags; configuration-only releases use `config-v<version>`. A release that changes both packages uses the runtime tag and publishes both versions. The runtime binary image has its own release tags. The release workflow publishes each missing npm version from a packed archive with provenance bound to the released commit.

A new npm package needs an initial manual publication before its trusted GitHub Actions publisher can be configured. Review and publish the packed archive, then configure `release.yml` as its trusted publisher. Never publish a workspace directory directly.
