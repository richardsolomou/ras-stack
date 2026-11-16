---
'ras-stack': major
---

Replace the runtime helpers and managed installs with copy-and-own recipes. The package now ships only the TypeScript and Oxlint presets under `config/`, the `ras preview` command, and the `ras-stack/preview/dokploy` export.

Removed:

- the runtime entrypoints `ras-stack/auth`, `auth/client`, `auth/react`, `email`, `database`, `database/sqlite`, `database/libsql`, `database/postgres`, `conformance`, `posthog`, `posthog/proxy`, `posthog/react`, `posthog/server`, `realtime`, `realtime/client`, `realtime/react`, `runtime`, `server`, `spacetime`, `tanstack/client`, `tanstack/middleware`, `tanstack/server`, `query`, `uploads`, and `vite`, with their optional peer dependencies;
- managed installs: `ras.config.ts`, `ras-stack/config`, the pnpm hook (`pnpmfile.mjs`), generated `.ras/` presets, and the `ras sync`, `update`, `typecheck`, `lint`, `format`, `dev`, `build`, `test`, `e2e`, `exec`, and `audit` commands;
- `ras assets`, `ras changesets check`, and `ras realtime`;
- the `update-stack.yml` reusable workflow's behaviour: it now only prints a notice, so scheduled callers keep passing until they are deleted.

Applications move to the recipes with the `ras-recipes` skill. See [Migrate from v5](https://github.com/richardsolomou/ras-stack/blob/main/docs/upgrades.md).
