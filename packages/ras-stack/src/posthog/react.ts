import { PostHogErrorBoundary, PostHogProvider, usePostHog } from '@posthog/react'
import { createContext, createElement, type ReactNode, useContext, useEffect, useRef, useState } from 'react'
import type { PostHogConfig, Properties } from 'posthog-js'
import { postHogBrowserOptions } from './client.js'
import type { PostHogEnvironment } from './config.js'
import { POSTHOG_DEFAULT_INGEST_PATH } from './proxy.js'

const PostHogLoadedContext = createContext(true)

export function PostHogIntegration({
  children,
  environment,
  fallback = createElement('main', null, 'Something went wrong. Refresh the page to try again.'),
  ingestPath = POSTHOG_DEFAULT_INGEST_PATH,
  options,
}: {
  children?: ReactNode
  environment: PostHogEnvironment | undefined
  fallback?: ReactNode
  ingestPath?: string
  options?: Partial<PostHogConfig>
}) {
  const [isLoaded, setIsLoaded] = useState(false)
  const loadedRef = useRef(options?.loaded)
  loadedRef.current = options?.loaded
  if (!environment) return children
  const tracingHostnames = typeof window === 'undefined' ? undefined : [window.location.hostname]
  return createElement(
    PostHogProvider,
    {
      apiKey: environment.projectToken,
      options: postHogBrowserOptions({
        apiHost: ingestPath,
        uiHost: environment.uiHost,
        ...(tracingHostnames ? { tracingHostnames } : {}),
        options: {
          ...options,
          loaded: (posthog) => {
            setIsLoaded(true)
            loadedRef.current?.(posthog)
          },
        },
      }),
    },
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
  const session = authClient.useSession()
  const posthog = usePostHog()
  const isLoaded = useContext(PostHogLoadedContext)
  const isReady = isLoaded || posthog['__loaded']
  const identified = useRef<string | undefined>(undefined)
  const propertiesRef = useRef(properties)
  propertiesRef.current = properties

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
