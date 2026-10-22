# RAS documentation

RAS 5 manages opted-in dependency versions and configuration through the main `ras-stack` package. It keeps normal upstream imports, explicit application manifests, and native pnpm installs. The separate `ras-stack-config` package is retired.

## Set up or maintain an application

| Need                                                       | Guide                                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Add RAS or install a fresh clone                           | [Installation](managed-installation.md)                                                                         |
| Select an integration or tool                              | [Configuration catalogue](configuration.md)                                                                     |
| Customize builds, styles, compiler settings, or lint rules | [Configuration](configuration.md#build-configuration)                                                           |
| Upgrade, opt out, or transfer dependency ownership         | [Upgrades and dependency ownership](upgrades.md)                                                                |
| Understand Dependabot or a failed install                  | [Update policy](upgrades.md#dependabot-and-security-updates) and [troubleshooting](upgrades.md#troubleshooting) |
| Replace the v4 configuration package                       | [Migrate from v4](upgrades.md#migrate-from-v4)                                                                  |

During the v5 prerelease, use the `next` tag explicitly. The [installation guide](managed-installation.md) explains bootstrapping, and the [upgrade guide](upgrades.md#prerelease-candidates) records candidate limitations.

## Use the runtime and delivery helpers

| Surface                                                                                       | Guide                                                                 |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Query, authentication, request security, databases, realtime, SpacetimeDB, email, and uploads | [Application primitives](application-primitives.md)                   |
| PostHog providers, identity, logs, metrics, tracing, proxies, and source maps                 | [PostHog integration](posthog.md)                                     |
| Assets, Actions, preview workflows, releases, and runtime binaries                            | [Repository tooling](repository-tooling.md)                           |
| The executable integration fixture                                                            | [Full-stack example](full-stack-example.md)                           |
| Backup, restore, migration, rollback, shutdown, and proxy boundaries                          | [Production reference operations](production-reference-operations.md) |

## Where guidance belongs

These guides own the shared RAS installation, configuration, CLI, dependency ownership, upgrade, and deployment contracts. Consumer repositories link here rather than copying those instructions. Consumer docs retain their own commands, ports, credentials, product behavior, and operating procedures.

Use documentation from the RAS revision being reviewed or the installed release when the default branch describes a newer contract. Candidate-specific merge requirements belong in the migration PR, not in an application's permanent contributing guide.

[Package overview](../README.md) · [Contributing to RAS](../CONTRIBUTING.md)
