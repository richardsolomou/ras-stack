export type PostHogCoverageDecision = true | { disabled: string }

export type PostHogCoverage = {
  browser: {
    analytics: PostHogCoverageDecision
    errorTracking: PostHogCoverageDecision
    sessionReplay: PostHogCoverageDecision
    featureFlags: PostHogCoverageDecision
  }
  server: {
    analytics: PostHogCoverageDecision
    errorTracking: PostHogCoverageDecision
    logs: PostHogCoverageDecision
  }
  sourceMaps: PostHogCoverageDecision
}

export function definePostHogCoverage(coverage: PostHogCoverage) {
  for (const [area, decision] of coverageDecisions(coverage)) {
    if (decision === true) continue
    if (!decision || typeof decision !== 'object' || typeof decision.disabled !== 'string') {
      throw new Error(`${area} must be enabled or include a disabled reason`)
    }
    if (!decision.disabled.trim()) throw new Error(`${area} disabled reason must not be empty`)
  }
  return coverage
}

function coverageDecisions(coverage: PostHogCoverage): Array<[string, PostHogCoverageDecision]> {
  return [
    ['browser.analytics', coverage.browser.analytics],
    ['browser.errorTracking', coverage.browser.errorTracking],
    ['browser.sessionReplay', coverage.browser.sessionReplay],
    ['browser.featureFlags', coverage.browser.featureFlags],
    ['server.analytics', coverage.server.analytics],
    ['server.errorTracking', coverage.server.errorTracking],
    ['server.logs', coverage.server.logs],
    ['sourceMaps', coverage.sourceMaps],
  ]
}
