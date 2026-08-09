# ras-stack

## 0.9.0

### Minor Changes

- fed41d4: Detect stale ras-stack and JavaScript toolchain references across repository manifests and workflows.

## 0.8.3

### Patch Changes

- db1b0bc: Test every published entrypoint through a clean package installation and browser bundle.

## 0.8.2

### Patch Changes

- 2c5330b: Embed TypeScript sources in published sourcemaps so consumer development servers can resolve them.

## 0.8.1

### Patch Changes

- 99159f6: Expose browser realtime helpers without loading the Node-only token signer entrypoint.

## 0.8.0

### Minor Changes

- de857bc: Add composable TypeScript runtime-role bases and opt-in Oxlint application and TanStack layers.

## 0.7.0

### Minor Changes

- 558b273: Add deterministic repository policy synchronization with committed-output drift checks and local overrides.

## 0.6.0

### Minor Changes

- 9f2800f: Add reusable JavaScript and browser check workflows around repository-owned commands.

## 0.5.0

### Minor Changes

- 6aa8a53: Add reusable Centrifugo client transport, subscription, recovery, and presence lifecycle helpers.

## 0.4.0

### Minor Changes

- 0aa50cf: Add optional TanStack Start RPC and Query integrations while preserving application-owned policy and configuration.

## 0.3.5

### Patch Changes

- 776e9bf: Target the repository explicitly when dispatching and monitoring npm publishing.

## 0.3.4

### Patch Changes

- fbed13e: Dispatch npm publishing through its top-level OIDC-trusted workflow.

## 0.3.3

### Patch Changes

- 6cea1a5: Expose release results from the reusable Changesets workflow to caller jobs.

## 0.3.2

### Patch Changes

- 247c9d4: Publish generated GitHub releases to npm through the OIDC-trusted workflow.

## 0.3.1

### Patch Changes

- 1f389e9: Adopt the shared Changesets release workflow and Just commands in ras-stack itself.
