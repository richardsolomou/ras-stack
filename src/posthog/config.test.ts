import { describe, expect, it } from 'vitest'
import { postHogEnvironment } from './config.js'

describe('PostHog environment', () => {
  it('stays disabled when both values are absent', () => {
    expect(postHogEnvironment({})).toBeUndefined()
  })

  it('uses US Cloud when only the project token is configured', () => {
    expect(postHogEnvironment({ projectToken: 'phc_test' })).toEqual({
      projectToken: 'phc_test',
      host: 'https://us.i.posthog.com',
      uiHost: 'https://us.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
    })
    expect(() => postHogEnvironment({ host: 'https://us.i.posthog.com' })).toThrow(
      'PostHog projectToken is required when a host is configured',
    )
  })

  it('normalizes a complete HTTPS configuration', () => {
    expect(postHogEnvironment({ projectToken: ' phc_test ', host: 'https://us.i.posthog.com/' })).toEqual({
      projectToken: 'phc_test',
      host: 'https://us.i.posthog.com',
      uiHost: 'https://us.posthog.com',
      assetsHost: 'https://us-assets.i.posthog.com',
    })
  })

  it('rejects credential-bearing and non-HTTP hosts', () => {
    expect(() => postHogEnvironment({ projectToken: 'phc_test', host: 'file:///tmp/posthog' })).toThrow(
      'PostHog host must be an HTTP URL without credentials, query, or fragment',
    )
    expect(() => postHogEnvironment({ projectToken: 'phc_test', host: 'https://user:secret@posthog.test' })).toThrow(
      'PostHog host must be an HTTP URL without credentials, query, or fragment',
    )
  })
})
