import { describe, expect, it } from 'vitest'
import { definePostHogCoverage } from './coverage.js'

describe('PostHog coverage declaration', () => {
  it('records enabled and intentionally disabled product surfaces', () => {
    expect(
      definePostHogCoverage({
        browser: { analytics: true, errorTracking: true, sessionReplay: { disabled: 'No user interface' }, featureFlags: true },
        server: { analytics: true, errorTracking: true, logs: { disabled: 'Logs stay local' } },
        sourceMaps: { disabled: 'The application is not minified' },
      }),
    ).toMatchObject({ browser: { analytics: true }, server: { analytics: true } })
  })

  it('rejects an empty reason for omitted coverage', () => {
    expect(() =>
      definePostHogCoverage({
        browser: { analytics: true, errorTracking: true, sessionReplay: { disabled: '' }, featureFlags: true },
        server: { analytics: true, errorTracking: true, logs: true },
        sourceMaps: true,
      }),
    ).toThrow('browser.sessionReplay disabled reason must not be empty')
  })

  it('reports a missing runtime decision clearly for JavaScript consumers', () => {
    expect(() =>
      definePostHogCoverage({
        browser: { analytics: true, errorTracking: true, sessionReplay: undefined, featureFlags: true },
        server: { analytics: true, errorTracking: true, logs: true },
        sourceMaps: true,
      } as unknown as Parameters<typeof definePostHogCoverage>[0]),
    ).toThrow('browser.sessionReplay must be enabled or include a disabled reason')
  })
})
