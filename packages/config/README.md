# ras-stack-config

Dependency-free TypeScript and Oxlint presets, versioned independently from the runtime integrations.

```sh
pnpm add -D ras-stack-config
```

```json
{
  "extends": "ras-stack-config/config/typescript/browser"
}
```

```json
{
  "extends": ["./node_modules/ras-stack-config/config/oxlint/application.json"]
}
```

Available TypeScript presets: base, bundler, browser, node-bundler, library and tanstack. Oxlint provides base rules, application and tanstack presets, and optional domain/layer import restrictions. Applications own aliases, includes and exceptions. See [repository tooling](../../docs/repository-tooling.md) for their contracts.
