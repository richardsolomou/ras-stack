---
'ras-stack': patch
---

Turn off `unicorn/no-useless-spread` in the lint presets. It judges by method name, so its fix turned `[...table.index.filter(key)]` from a SpacetimeDB module, which returns an iterator, into the bare iterator and broke `.length` and `.some` on the result.
