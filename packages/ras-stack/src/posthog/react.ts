import { PostHogErrorBoundary, PostHogProvider, usePostHog } from '@posthog/react'
import { createContext, createElement, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import type { PostHogConfig, Properties } from 'posthog-js'
import { POSTHOG_DEFAULT_INGEST_PATH, type PostHogBrowserService, type PostHogEnvironment } from './config.js'

const POSTHOG_BROWSER_DEFAULTS = '2026-05-30'

const PostHogLoadedContext = createContext(true)

export function PostHogIntegration({
  children,
  environment,
  fallback = createElement('main', null, 'Something went wrong. Refresh the page to try again.'),
  ingestPath = POSTHOG_DEFAULT_INGEST_PATH,
  options,
  service,
}: {
  children?: ReactNode
  environment: PostHogEnvironment | undefined
  fallback?: ReactNode
  ingestPath?: string
  options?: Partial<PostHogConfig>
  service?: PostHogBrowserService
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const loadedRef = useRef(options?.loaded)
  useEffect(() => {
    loadedRef.current = options?.loaded
  })
  if (!environment) return children
  const { session_recording: sessionRecording, ...overrides } = options ?? {}
  const serviceOptions = service
    ? {
        serviceName: required(service.name, 'service.name'),
        ...(service.version ? { serviceVersion: service.version } : {}),
        ...(service.environment ? { environment: service.environment } : {}),
        ...(service.resourceAttributes ? { resourceAttributes: service.resourceAttributes } : {}),
      }
    : undefined
  const browserOptions: Partial<PostHogConfig> = {
    api_host: required(ingestPath, 'apiHost'),
    ui_host: environment.uiHost,
    defaults: POSTHOG_BROWSER_DEFAULTS,
    capture_exceptions: true,
    capture_pageview: 'history_change',
    capture_performance: true,
    custom_personal_data_properties: ['token'],
    mask_personal_data_properties: true,
    person_profiles: 'identified_only',
    session_recording: { maskAllInputs: true, blockSelector: '.ph-no-capture', ...sessionRecording },
    ...(serviceOptions ? { logs: serviceOptions, metrics: serviceOptions } : {}),
    ...(typeof window === 'undefined' ? {} : { tracing_headers: [window.location.hostname] }),
    ...overrides,
    loaded: (posthog) => {
      setIsLoaded(true)
      loadedRef.current?.(posthog)
    },
  }
  return createElement(
    PostHogProvider,
    // oxlint-disable-next-line react/refs -- PostHog reads `loadedRef` only when it calls `loaded` after initialization.
    { apiKey: environment.projectToken, options: browserOptions },
    createElement(PostHogLoadedContext.Provider, { value: isLoaded }, createElement(PostHogErrorBoundary, { fallback }, children)),
  )
}

export type BetterAuthUser = { id: string }
export type BetterAuthSession<User extends BetterAuthUser = BetterAuthUser> = { user: User }
export type BetterAuthSessionState<User extends BetterAuthUser = BetterAuthUser> = {
  data?: BetterAuthSession<User> | null
  error?: unknown
  isPending: boolean
}
export type BetterAuthReactClient<User extends BetterAuthUser = BetterAuthUser> = {
  useSession: () => BetterAuthSessionState<User>
}

export function PostHogBetterAuthIdentity<User extends BetterAuthUser>({
  authClient,
  properties,
}: {
  authClient: BetterAuthReactClient<User>
  properties?: (user: User) => Properties
}) {
  // oxlint-disable-next-line react/hooks -- Better Auth exposes its session hook on the client, which applications create once.
  const session = authClient.useSession()
  const posthog = usePostHog()
  const isLoaded = useContext(PostHogLoadedContext)
  const isReady = isLoaded || posthog['__loaded']
  const identified = useRef<string | undefined>(undefined)
  const propertiesRef = useRef(properties)
  useEffect(() => {
    propertiesRef.current = properties
  })

  useEffect(() => {
    if (!isReady || session.isPending || session.error) return
    const user = session.data?.user
    const persistedUserId = posthog.get_property('$user_id')
    if (user) {
      if (persistedUserId && persistedUserId !== user.id) posthog.reset()
      posthog.identify(user.id, propertiesRef.current?.(user))
      identified.current = user.id
    } else if (identified.current || persistedUserId) {
      posthog.reset()
      identified.current = undefined
    }
  }, [isReady, posthog, session.data?.user, session.error, session.isPending])

  return null
}

function required(value: string, name: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${name} is required`)
  return normalized
}
