---
'ras-stack': minor
---

Add `ras init`, which walks a repository to the adoption baseline the policy already enforces. It offers the policy selection and its generated files, the declared Node and pnpm versions, a `tsconfig.json` extending a shared preset, an `.oxlintrc.json`, a CI workflow pinned to the release that generated it, and a justfile. Every step is a separate question, an existing file needs its own answer before it is replaced, `--dry-run` reports the plan, and `--yes` accepts everything for a non-interactive run.
