import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'
import { PostHogIntegration } from './react.js'

const { provider, boundary } = vi.hoisted(() => ({ provider: vi.fn(), boundary: vi.fn() }))

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@posthog/react', () => ({
  PostHogProvider: (properties: { children: unknown }) => {
    provider(properties)
    return properties.children
  },
  PostHogErrorBoundary: (properties: { children: unknown }) => {
    boundary(properties)
    return properties.children
  },
}))

describe('PostHog React integration', () => {
  it('renders without loading PostHog when deployment configuration is absent', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => void create(createElement(PostHogIntegration, { environment: undefined }, 'application')))
    warning.mockRestore()
    expect(provider).not.toHaveBeenCalled()
  })

  it('installs the provider and render error boundary with complete defaults', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await act(async () => {
      create(
        createElement(
          PostHogIntegration,
          {
            environment: {
              projectToken: 'phc_test',
              host: 'https://us.i.posthog.com',
              uiHost: 'https://us.posthog.com',
              assetsHost: 'https://us-assets.i.posthog.com',
            },
          },
          'application',
        ),
      )
    })
    warning.mockRestore()
    expect(provider).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: 'phc_test',
        options: expect.objectContaining({
          api_host: '/ingest',
          capture_exceptions: true,
          capture_pageview: 'history_change',
          person_profiles: 'identified_only',
        }),
      }),
    )
    expect(boundary).toHaveBeenCalledOnce()
  })
})
