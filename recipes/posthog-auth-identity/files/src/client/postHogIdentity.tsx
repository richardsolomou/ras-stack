import { usePostHog } from '@posthog/react'
import { useEffect, useRef } from 'react'
import { authClient } from './auth'

/**
 * Identifies PostHog as the signed-in Better Auth user and resets it after sign-out, so browser events, replays, and the
 * server work its tracing headers link to join the right person. Mount it inside `PostHogIntegration`.
 */
export function PostHogIdentity() {
  const session = authClient.useSession()
  const posthog = usePostHog()
  const identified = useRef<string | undefined>(undefined)
  const userId = session.data?.user.id

  useEffect(() => {
    // While the session loads or a refresh fails the last answer stands, so a flaky network never signs analytics out.
    if (!posthog.__loaded || session.isPending || session.error) return
    const persisted: unknown = posthog.get_property('$user_id')
    if (userId) {
      // Another user in the same browser, such as an administrator impersonating someone, must not continue their session.
      if (persisted && persisted !== userId) posthog.reset()
      posthog.identify(userId)
      identified.current = userId
    } else if (identified.current || persisted) {
      // A page can load signed out with an identity saved earlier, such as after a password reset ended every session.
      posthog.reset()
      identified.current = undefined
    }
  }, [posthog, userId, session.isPending, session.error])

  return null
}
