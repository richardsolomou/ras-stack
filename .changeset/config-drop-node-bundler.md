---
'ras-stack-config': major
---

Remove the `typescript/node-bundler` preset, which no consuming repository extends. Extend `typescript/bundler` and set the `target`, `lib`, and `types` a bundled Node script needs locally.
