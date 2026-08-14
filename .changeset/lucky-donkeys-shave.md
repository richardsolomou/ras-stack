---
'ras-stack': patch
---

`postgresRateLimitStore` now returns `resetAt` as a number. A `bigint` column arrives from Postgres.js as a string unless the client happens to configure a parser, so a store built on a plain `postgres()` client returned a string and callers comparing it against a timestamp got the wrong answer. The store converts its own columns rather than depending on how the connection was built.
