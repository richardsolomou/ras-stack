import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    identity: true,
    logs: true,
    metrics: true,
    sessionReplay: { disabled: 'The example does not handle user data worth replaying' },
    featureFlags: { disabled: 'The example has no rollout-controlled behavior' },
  },
  server: {
    analytics: true,
    errorTracking: true,
    logs: true,
    metrics: true,
    tracing: true,
  },
  sourceMaps: { disabled: 'The example is not deployed as a user-facing application' },
})
