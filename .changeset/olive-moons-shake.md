---
'ras-stack': minor
---

Add rate limiting for the routes an application writes, which Better Auth's own limiter does not reach. `createRateLimit` composes into the same `requireMutation` hook as the origin check, rejecting with `429` and `Retry-After`, `403` for a client it cannot identify, and a retryable `InfrastructureError` when the store is unavailable.

Counters are shared rather than per-process so replicas enforce one budget between them: `postgresRateLimitStore` and `sqliteRateLimitStore` each increment in a single statement, and `memoryRateLimitStore` covers development. Applications own the table. `assertRateLimitStoreConformance` checks a store against the real database.
