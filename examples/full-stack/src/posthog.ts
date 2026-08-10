import { definePostHogCoverage } from 'ras-stack/posthog'

export const postHogCoverage = definePostHogCoverage({
  browser: {
    analytics: true,
    errorTracking: true,
    sessionReplay: { disabled: 'The example does not handle user data worth replaying' },
    featureFlags: { disabled: 'The example has no rollout-controlled behavior' },
  },
  server: {
    analytics: { disabled: 'The example does not define product events' },
    errorTracking: { disabled: 'The server client is exercised only as an integration contract' },
    logs: { disabled: 'The example keeps logs in the container output' },
  },
  sourceMaps: { disabled: 'The example is not deployed as a user-facing application' },
})
