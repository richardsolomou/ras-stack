---
'ras-stack': patch
---

Read only the `Version` line in `setup-playwright`, so the install pnpm 11 runs before `pnpm exec` when `node_modules` is out of date no longer breaks the step's output.
