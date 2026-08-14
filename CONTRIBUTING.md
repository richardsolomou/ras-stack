# Contributing to ras-stack

Install Node 24.x, pnpm 11.15.0, and Just 1.58.0, then run:

```sh
just install
just check
```

`just check` runs formatting, linting, shared-configuration resolution, type checking, unit tests, and the package build.

Repository policy is selected in `ras-stack.policy.json`. Run `node dist/cli.js policy sync` after changing generated policy and `node dist/cli.js policy sync adoption` after changing shared version expectations; `just check` rejects drift.

Keep exports composable. Shared code may implement duplicated infrastructure mechanics, but applications retain direct access to upstream libraries and ownership of schemas, migrations, authorization, routes, plugins, domain events, and product policy. Prefer one independently useful function over a configuration facade.

`build`, `policy`, and `preview` are repository tooling and must stay out of the application modules, so an application never pulls CI-only code and its dependencies in through an import. A new module directory has to be classified either way before the boundary test passes.

Every exported behavior needs a contract test. Avoid runtime dependencies when a platform API or injected capability is sufficient.

## Releases

Add a Changeset for every package, action, or reusable-workflow change that needs a release. Merging it to `main` runs the shared release workflow, updates the version and changelog, creates the tag and GitHub release, and triggers `.github/workflows/release.yml` to publish npm with provenance.

The first npm version must be published manually because npm only allows a trusted publisher to be configured for an existing package. After that bootstrap publish, configure `release.yml` as the package's trusted GitHub Actions publisher. The release workflow skips a version that already exists, so creating the matching first GitHub release remains safe.
