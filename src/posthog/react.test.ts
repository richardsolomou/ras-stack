import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHogBetterAuthIdentity, PostHogIntegration, type BetterAuthSessionState } from './react.js'

const { provider, boundary, posthog } = vi.hoisted(() => ({
  provider: vi.fn(),
  boundary: vi.fn(),
  posthog: { identify: vi.fn(), reset: vi.fn() },
}))

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
  usePostHog: () => posthog,
}))

beforeEach(() => vi.clearAllMocks())

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

  it('routes through a custom ingest path when configured', async () => {
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
            ingestPath: '/relay',
          },
          'application',
        ),
      )
    })
    warning.mockRestore()
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ api_host: '/relay' }) }))
  })
})

describe('PostHog Better Auth identity', () => {
  it('identifies authenticated sessions without defaulting to personal properties', async () => {
    const state: BetterAuthSessionState = { data: { user: { id: 'person-123' } }, isPending: false }
    await act(async () => void create(createElement(PostHogBetterAuthIdentity, { authClient: { useSession: () => state } })))
    expect(posthog.identify).toHaveBeenCalledWith('person-123', undefined)
  })

  it('does not identify again when only the property mapper changes', async () => {
    const state: BetterAuthSessionState = { data: { user: { id: 'person-123' } }, isPending: false }
    const authClient = { useSession: () => state }
    let renderer: ReturnType<typeof create>
    await act(
      async () =>
        void (renderer = create(createElement(PostHogBetterAuthIdentity, { authClient, properties: () => ({ role: 'member' }) }))),
    )
    await act(async () => renderer.update(createElement(PostHogBetterAuthIdentity, { authClient, properties: () => ({ role: 'member' }) })))
    expect(posthog.identify).toHaveBeenCalledOnce()
  })

  it('resets only after an identified session signs out', async () => {
    let state: BetterAuthSessionState = { data: null, isPending: false }
    const authClient = { useSession: () => state }
    let renderer: ReturnType<typeof create>
    await act(async () => void (renderer = create(createElement(PostHogBetterAuthIdentity, { authClient }))))
    expect(posthog.reset).not.toHaveBeenCalled()

    state = { data: { user: { id: 'person-123' } }, isPending: false }
    await act(async () => renderer.update(createElement(PostHogBetterAuthIdentity, { authClient })))
    state = { isPending: true }
    await act(async () => renderer.update(createElement(PostHogBetterAuthIdentity, { authClient })))
    state = { data: null, isPending: false }
    await act(async () => renderer.update(createElement(PostHogBetterAuthIdentity, { authClient })))
    expect(posthog.reset).toHaveBeenCalledOnce()
  })

  it('preserves identity when a session refresh fails', async () => {
    let state: BetterAuthSessionState = { data: { user: { id: 'person-123' } }, isPending: false }
    const authClient = { useSession: () => state }
    let renderer: ReturnType<typeof create>
    await act(async () => void (renderer = create(createElement(PostHogBetterAuthIdentity, { authClient }))))
    state = { data: null, error: new Error('offline'), isPending: false }
    await act(async () => renderer.update(createElement(PostHogBetterAuthIdentity, { authClient })))
    expect(posthog.reset).not.toHaveBeenCalled()
  })
})
