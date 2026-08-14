---
'ras-stack': minor
---

Add `assertRealtimeTokenConformance` so a consumer can check the route that mints Centrifugo tokens against the shared secret. It verifies the token is HS256, binds the subject it was asked for, carries its claims, expires within a configurable maximum, and is signed with the secret Centrifugo shares.
