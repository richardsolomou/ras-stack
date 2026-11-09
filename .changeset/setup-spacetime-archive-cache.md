---
'ras-stack': patch
---

Cache the verified SpacetimeDB release archive in `setup-spacetime`, so that a GitHub release outage no longer fails jobs for a version already downloaded.
