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

const environment = {
  projectToken: 'phc_test',
  host: 'https://us.i.posthog.com',
  uiHost: 'https://us.posthog.com',
  assetsHost: 'https://us-assets.i.posthog.com',
}

async function browserOptions(properties: Omit<Parameters<typeof PostHogIntegration>[0], 'environment'> = {}) {
  const warning = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  await act(async () => void create(createElement(PostHogIntegration, { environment, ...properties }, 'application')))
  warning.mockRestore()
  return provider.mock.lastCall?.[0].options
}

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
    expect(await browserOptions()).toMatchObject({
      api_host: '/t',
      ui_host: 'https://us.posthog.com',
      defaults: '2026-05-30',
      capture_exceptions: true,
      capture_pageview: 'history_change',
      capture_performance: true,
      custom_personal_data_properties: ['token'],
      mask_personal_data_properties: true,
      person_profiles: 'identified_only',
      session_recording: { maskAllInputs: true, blockSelector: '.ph-no-capture' },
    })
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ apiKey: 'phc_test' }))
    expect(boundary).toHaveBeenCalledOnce()
  })

  it('preserves application overrides of the defaults', async () => {
    expect(
      await browserOptions({ options: { autocapture: false, capture_exceptions: false, mask_personal_data_properties: false } }),
    ).toMatchObject({ autocapture: false, capture_exceptions: false, mask_personal_data_properties: false })
  })

  it('keeps replay privacy defaults when an application overrides one recording option', async () => {
    const options = await browserOptions({ options: { session_recording: { captureCanvas: { recordCanvas: true } } } })
    expect(options.session_recording).toEqual({
      maskAllInputs: true,
      blockSelector: '.ph-no-capture',
      captureCanvas: { recordCanvas: true },
    })
  })

  it('adds request correlation for the current application host', async () => {
    vi.stubGlobal('window', { location: { hostname: 'app.example' } })
    try {
      expect(await browserOptions()).toMatchObject({ tracing_headers: ['app.example'] })
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('configures browser logs and metrics with one service identity', async () => {
    const service = {
      serviceName: 'storefront-web',
      serviceVersion: '1.2.3',
      environment: 'production',
      resourceAttributes: { region: 'eu' },
    }
    expect(
      await browserOptions({
        service: { name: 'storefront-web', version: '1.2.3', environment: 'production', resourceAttributes: { region: 'eu' } },
      }),
    ).toMatchObject({ logs: service, metrics: service })
  })

  it.each(['/relay', 'https://eu.i.posthog.com'])('routes browser ingestion to %s when configured', async (ingestPath) => {
    expect(await browserOptions({ ingestPath })).toMatchObject({ api_host: ingestPath })
  })

  it('reconciles identity after the provider loads', async () => {
    const loaded = vi.fn()
    const state: BetterAuthSessionState = { data: { user: { id: 'person-123' } }, isPending: false }
    await act(async () => {
      create(
        createElement(
          PostHogIntegration,
          {
            environment,
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
            environment,
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
