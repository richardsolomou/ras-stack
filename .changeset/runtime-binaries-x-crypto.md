---
'ras-stack': patch
---

Pin the development runtime image to `runtime-v1.0.2`, which rebuilds Caddy
and Centrifugo against `golang.org/x/crypto` v0.55.0 for GO-2026-6303.
