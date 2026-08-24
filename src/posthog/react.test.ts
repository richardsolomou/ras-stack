import { createElement } from 'react'
import { act, create } from 'react-test-renderer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostHogBetterAuthIdentity, PostHogIntegration, type BetterAuthSessionState } from './react.js'

const { provider, boundary, posthog } = vi.hoisted(() => ({
  provider: vi.fn(),
  boundary: vi.fn(),
  posthog: { __loaded: false, get_property: vi.fn(), identify: vi.fn(), reset: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks()
  posthog['__loaded'] = false
  posthog.get_property.mockReturnValue(undefined)
})

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

  it('reconciles identity after the provider loads', async () => {
    const loaded = vi.fn()
    const state: BetterAuthSessionState = { data: { user: { id: 'person-123' } }, isPending: false }
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
            options: { loaded },
          },
          createElement(PostHogBetterAuthIdentity, { authClient: { useSession: () => state } }),
        ),
      )
    })
    expect(posthog.identify).not.toHaveBeenCalled()

    const onLoaded = provider.mock.lastCall?.[0].options.loaded
    await act(async () => onLoaded(posthog))
    expect(loaded).toHaveBeenCalledWith(posthog)
    expect(posthog.identify).toHaveBeenCalledWith('person-123', undefined)
  })

  it('reconciles identity when an initialized provider remounts', async () => {
    posthog['__loaded'] = true
    posthog.get_property.mockReturnValue('administrator-123')
    const state: BetterAuthSessionState = { data: { user: { id: 'impersonated-456' } }, isPending: false }
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
          createElement(PostHogBetterAuthIdentity, { authClient: { useSession: () => state } }),
        ),
      )
    })
    expect(posthog.reset).toHaveBeenCalledOnce()
    expect(posthog.identify).toHaveBeenCalledWith('impersonated-456', undefined)
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

  it('resets a persisted identified user when the application mounts signed out', async () => {
    posthog.get_property.mockImplementation((property) => (property === '$user_id' ? 'person-123' : undefined))
    const state: BetterAuthSessionState = { data: null, isPending: false }
    await act(async () => void create(createElement(PostHogBetterAuthIdentity, { authClient: { useSession: () => state } })))
    expect(posthog.get_property).toHaveBeenCalledWith('$user_id')
    expect(posthog.reset).toHaveBeenCalledOnce()
  })

  it('resets before identifying when the authenticated user changes across a reload', async () => {
    posthog.get_property.mockReturnValue('administrator-123')
    const state: BetterAuthSessionState = { data: { user: { id: 'impersonated-456' } }, isPending: false }
    await act(async () => void create(createElement(PostHogBetterAuthIdentity, { authClient: { useSession: () => state } })))
    expect(posthog.reset).toHaveBeenCalledOnce()
    expect(posthog.identify).toHaveBeenCalledWith('impersonated-456', undefined)
    expect(posthog.reset.mock.invocationCallOrder[0]).toBeLessThan(posthog.identify.mock.invocationCallOrder[0]!)
  })

  it('preserves the analytics session when the persisted user matches', async () => {
    posthog.get_property.mockReturnValue('person-123')
    const state: BetterAuthSessionState = { data: { user: { id: 'person-123' } }, isPending: false }
    await act(async () => void create(createElement(PostHogBetterAuthIdentity, { authClient: { useSession: () => state } })))
    expect(posthog.reset).not.toHaveBeenCalled()
    expect(posthog.identify).toHaveBeenCalledWith('person-123', undefined)
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
