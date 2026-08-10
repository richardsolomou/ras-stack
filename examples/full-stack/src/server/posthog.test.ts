import { describe, expect, it } from 'vitest'
import { postHogEnvironment, postHogRequestContext } from 'ras-stack/posthog'
import { createManagedPostHogServerTelemetry, createPostHogServerClient } from 'ras-stack/posthog/server'
import { postHogCoverage } from '../posthog'

describe('PostHog integration boundary', () => {
  it('stays disabled without deployment configuration', async () => {
    expect(await createPostHogServerClient(postHogEnvironment({}))).toBeUndefined()
    expect(postHogCoverage.browser.errorTracking).toBe(true)
  })

  it('propagates a browser session only with the authenticated identity', () => {
    const request = new Request('https://example.test/action', {
      headers: { 'x-posthog-distinct-id': 'person-123', 'x-posthog-session-id': 'session-456' },
    })
    expect(postHogRequestContext(request, { authenticatedDistinctId: 'person-123' })).toEqual({
      distinctId: 'person-123',
      sessionId: 'session-456',
      properties: { $session_id: 'session-456' },
    })
  })

  it('keeps the managed server lifecycle optional', async () => {
    const telemetry = createManagedPostHogServerTelemetry({ environment: postHogEnvironment({}), serviceName: 'example' })
    await telemetry.start()
    await telemetry.log({ body: 'request completed', severityText: 'info' })
    await telemetry.shutdown()
    expect(postHogCoverage.server.logs).toBe(true)
  })
})
