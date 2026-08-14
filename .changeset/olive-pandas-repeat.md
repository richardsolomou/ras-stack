---
'ras-stack': minor
---

Add conformance suites for three more mechanics that fail invisibly until production. `assertAuthSecretConformance` checks that the secret is long, random-looking, stable across calls, and overridden by `AUTH_SECRET`. `assertRealtimePublisherConformance` checks that a publisher bounds what it accepts and refuses work after `close()`. `assertSmtpConfigConformance` checks that half-configured SMTP is rejected rather than carried into a deployment.
