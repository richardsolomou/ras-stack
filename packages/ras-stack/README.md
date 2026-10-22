# ras-stack

Opt into a tested TypeScript stack. RAS supplies compatible dependency versions, configured tools, and shared runtime helpers. Applications keep upstream imports and their own product behavior.

[npm](https://www.npmjs.com/package/ras-stack) · [Documentation](https://github.com/richardsolomou/ras-stack/blob/main/docs/README.md) · [Full-stack example](https://github.com/richardsolomou/ras-stack/tree/main/examples/full-stack)

## How it works

Select integrations and tools in a typed `ras.config.ts`. Run `ras sync` once to configure the shipped pnpm hook. Native pnpm installation then adds their exact versions to the application graph in memory and regenerates ignored local compiler/linter configuration. Managed dependencies and RAS metadata stay out of the physical `package.json`.

The resulting application uses normal pnpm installs. Only selected integrations and their dependencies are installed. Application code can still import `@tanstack/react-query`, `better-auth`, or another selected upstream library directly.

| Task                                              | Command                          |
| ------------------------------------------------- | -------------------------------- |
| Install a clone                                   | `pnpm install --frozen-lockfile` |
| Apply changed selections                          | `pnpm install`                   |
| Check hook wiring, policy, and installed versions | `pnpm exec ras sync --check`     |
| Upgrade RAS and the selected stack together       | `pnpm exec ras update`           |

These docs describe RAS 5, which includes the former `ras-stack-config` presets in the main package. During the v5 prerelease, bootstrap with `ras-stack@next` and use `ras update next` for candidate upgrades. See [installation](https://github.com/richardsolomou/ras-stack/blob/main/docs/managed-installation.md) and [migration from v4](https://github.com/richardsolomou/ras-stack/blob/main/docs/upgrades.md#migrate-from-v4) before changing an existing application.

## What RAS owns

| RAS                                                                             | Application                                                                          |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Tested direct versions for opted-in integrations                                | Plain libraries, custom integrations, and application-specific dependencies          |
| React/Vite, Start, Nitro, Tailwind, and PostHog build defaults when selected    | Routes, entrypoints, providers, credentials, and application-specific plugin options |
| Versioned TypeScript and Oxlint presets                                         | Local compiler options, lint exceptions, and repository boundaries                   |
| Authentication, database, Query, realtime, email, upload, and telemetry helpers | Schemas, migrations, authorization, cache policy, product events, and UI             |
| CLI commands, reusable Actions, preview mechanics, and runtime binaries         | Deployment topology, secrets, storage, release policy, and product hooks             |

The consumer manifest lists application-owned packages. `ras.config.ts` selects managed capabilities, and `pnpm-workspace.yaml` declares the RAS config dependency once. pnpm keeps its boot integrity and the complete application graph in the consumer lockfile. Runtime and development dependencies remain distinct; unselected SDKs and development tools are excluded from production installations.

## Documentation

Start at the [documentation index](https://github.com/richardsolomou/ras-stack/blob/main/docs/README.md).

- [Installation](https://github.com/richardsolomou/ras-stack/blob/main/docs/managed-installation.md): first sync, committed files, workspaces, CI, and production installs.
- [Configuration](https://github.com/richardsolomou/ras-stack/blob/main/docs/configuration.md): integration catalogue, tool presets, build overrides, and custom descriptors.
- [Upgrades and dependency ownership](https://github.com/richardsolomou/ras-stack/blob/main/docs/upgrades.md): updates, opt-outs, Dependabot, failure recovery, and v4 migration.
- [Application primitives](https://github.com/richardsolomou/ras-stack/blob/main/docs/application-primitives.md): native runtime helpers and the behavior applications still own.
- [PostHog](https://github.com/richardsolomou/ras-stack/blob/main/docs/posthog.md): providers, identity, telemetry, proxying, and configured source maps.
- [Repository tooling](https://github.com/richardsolomou/ras-stack/blob/main/docs/repository-tooling.md): assets, Actions, previews, releases, and runtime binaries.
- [Full-stack example](https://github.com/richardsolomou/ras-stack/blob/main/docs/full-stack-example.md) and [production operations](https://github.com/richardsolomou/ras-stack/blob/main/docs/production-reference-operations.md): the executable reference and its operating procedures.

Runtime imports use narrow paths such as `ras-stack/query`, `ras-stack/auth`, and `ras-stack/database/sqlite`. The separately released OCI image contains verified Caddy and Centrifugo binaries; installing the npm package does not install that image or provision services.

## Contributing

The RAS workspace uses Node 24, pnpm 11.15.0, and Just 1.58.0:

```sh
just install
just check
```

See [CONTRIBUTING.md](https://github.com/richardsolomou/ras-stack/blob/main/CONTRIBUTING.md) for development and releases, and [SECURITY.md](https://github.com/richardsolomou/ras-stack/blob/main/SECURITY.md) for private vulnerability reports.

[MIT license](https://github.com/richardsolomou/ras-stack/blob/main/packages/ras-stack/LICENSE).
