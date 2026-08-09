# Contributing to ras-stack

Install Node 24.x and pnpm 11.15.0, then run:

```sh
pnpm install
pnpm check
```

`pnpm check` runs formatting, linting, shared-configuration resolution, type checking, unit tests, and the package build.

Keep exports composable. Shared code may implement duplicated infrastructure mechanics, but applications retain direct access to upstream libraries and ownership of schemas, migrations, authorization, routes, plugins, domain events, and product policy. Prefer one independently useful function over a configuration facade.

Every exported behavior needs a contract test. Avoid runtime dependencies when a platform API or injected capability is sufficient.

## Releases

Update `package.json` with the intended semantic version before merging a release. Action and reusable-workflow changes need a new tag even when the npm package code is unchanged. Create a GitHub release with the matching `v<version>` tag only after `main` passes; `.github/workflows/release.yml` verifies the tag, reruns the complete gate, and publishes to npm with provenance.

The first npm version must be published manually because npm only allows a trusted publisher to be configured for an existing package. After that bootstrap publish, configure `release.yml` as the package's trusted GitHub Actions publisher. The release workflow skips a version that already exists, so creating the matching first GitHub release remains safe.
