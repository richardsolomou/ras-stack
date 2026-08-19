# Contributing to ras-stack

Install Node 24.x, pnpm 11.15.0, and Just 1.58.0, then run:

```sh
just install
just check
```

`just check` runs formatting, linting, shared-configuration resolution, type checking, unit tests, and the package build. Unit tests enforce the coverage thresholds in `vitest.config.ts`; raise a threshold when a change clears it rather than leaving new code untested.

`just check-actions` lints the shell scripts and workflow definitions the published actions ship. It needs ShellCheck and actionlint, which `mise install` provides at the versions pinned in `mise.toml`.

Repository policy is selected in `ras-stack.policy.json`. Run `node dist/cli.js policy sync` after changing generated policy; `just check` rejects drift.

Keep exports composable. Shared code may implement duplicated infrastructure mechanics, but applications retain direct access to upstream libraries and ownership of schemas, migrations, authorization, routes, plugins, domain events, and product policy. Prefer one independently useful function over a configuration facade.

`build`, `policy`, and `preview` are repository tooling and must stay out of the application modules, so an application never pulls CI-only code and its dependencies in through an import. A new module directory has to be classified either way before the boundary test passes.

Every exported behavior needs a contract test, including the `ras` commands. Vitest runs `src/**/*.test.ts` and `actions/**/*.test.ts`, so a test covering an action script can sit beside the script or with the module that owns it. Avoid runtime dependencies when a platform API or injected capability is sufficient.

## Releases

Add a Changeset for every package, action, or reusable-workflow change that needs a release. `ras-stack` and `create-ras-app` are fixed to the same version because the latter delegates directly to the former. Merging a Changeset to `main` runs the shared release workflow, updates both versions and changelogs, creates the tag and GitHub release, and triggers `.github/workflows/release.yml` at that tag to publish every missing npm package with provenance bound to the released commit.

The first version of an npm package must be published manually because npm only allows a trusted publisher to be configured for an existing package. From the repository root, bootstrap `create-ras-app@0.40.0` before merging its release, while both source packages are still version `0.40.0`:

```sh
test "$(node -p "require('./package.json').version")" = "0.40.0"
test "$(node -p "require('./packages/create-ras-app/package.json').version")" = "0.40.0"
pnpm --dir packages/create-ras-app pack --out /tmp/create-ras-app-0.40.0.tgz
node -e "const { execFileSync } = require('node:child_process'); const manifest = JSON.parse(execFileSync('tar', ['-xOf', '/tmp/create-ras-app-0.40.0.tgz', 'package/package.json'], { encoding: 'utf8' })); if (manifest.name !== 'create-ras-app' || manifest.version !== '0.40.0' || manifest.dependencies?.['ras-stack'] !== '^0.40.0' || manifest.bin?.['create-ras-app'] !== './cli.js') process.exit(1)"
npm publish /tmp/create-ras-app-0.40.0.tgz --access public --dry-run
npm publish /tmp/create-ras-app-0.40.0.tgz --access public
```

Always publish the pnpm-packed archive; publishing the workspace directory directly would retain `workspace:^` and can produce different executable metadata. After the bootstrap publish, configure `release.yml` as the package's trusted GitHub Actions publisher. The release workflow skips each version that already exists, so manually publishing a new package before rerunning the matching GitHub release remains safe.
