---
'ras-stack': patch
---

Keep retrying the SpacetimeDB download in `setup-spacetime` for about a minute, so that a brief GitHub release outage no longer fails the job.
