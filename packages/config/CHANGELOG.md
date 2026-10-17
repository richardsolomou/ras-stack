# ras-stack-config

## 3.0.0

### Major Changes

- 3c229b4: Remove the `typescript/node-bundler` preset, which no consuming repository extends. Extend `typescript/bundler` and set the `target`, `lib`, and `types` a bundled Node script needs locally.

## 2.0.0

### Major Changes

- 18eca2f: Restrict the `oxlint/domain` preset to `src/core/**`. Applications with other domain directories repeat the override for those paths in their own Oxlint configuration.
