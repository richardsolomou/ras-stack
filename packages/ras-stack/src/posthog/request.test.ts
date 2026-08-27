import { describe, expect, it } from 'vitest'
import { postHogRequestContext } from './request.js'

describe('PostHog request context', () => {
  it('accepts a claimed distinct id only after application authentication agrees', () => {
    const request = new Request('https://app.test/action', {
      headers: { 'x-posthog-distinct-id': 'person-123', 'x-posthog-session-id': 'session-456' },
    })
    expect(postHogRequestContext(request, { authenticatedDistinctId: 'person-123' })).toEqual({
      distinctId: 'person-123',
      sessionId: 'session-456',
      properties: { $session_id: 'session-456' },
    })
  })

  it('keeps a spoofed distinct id out of authenticated server events', () => {
    const request = new Request('https://app.test/action', {
      headers: { 'x-posthog-distinct-id': 'attacker', 'x-posthog-session-id': 'session-456' },
    })
    expect(postHogRequestContext(request, { authenticatedDistinctId: 'person-123' })).toEqual({
      sessionId: 'session-456',
      properties: { $session_id: 'session-456' },
    })
  })

  it('requires an explicit decision before accepting anonymous distinct ids', () => {
    const request = new Request('https://app.test/action', { headers: { 'x-posthog-distinct-id': 'anonymous-123' } })
    expect(postHogRequestContext(request)).toEqual({ properties: {} })
    expect(postHogRequestContext(request, { allowAnonymousDistinctId: true })).toEqual({
      distinctId: 'anonymous-123',
      properties: {},
    })
  })
})
