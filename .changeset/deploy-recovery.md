---
'ras-stack': minor
---

Add `staleServerFunctionMiddleware` to `ras-stack/tanstack/middleware` and `chunkRecoveryScript` to the new `ras-stack/tanstack/client` entrypoint, so tabs opened before a deploy fail cleanly or reload instead of breaking silently.
