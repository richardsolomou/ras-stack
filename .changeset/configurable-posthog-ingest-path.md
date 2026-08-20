---
'ras-stack': minor
---

Allow `postHogIngestProxy` and `PostHogIntegration` to route through a custom ingest path instead of the hardcoded `/ingest`, since some ad-blocker lists block that literal path segment regardless of host.
