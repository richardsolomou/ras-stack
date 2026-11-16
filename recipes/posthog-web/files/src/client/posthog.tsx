import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import { posthog } from 'posthog-js'
import type { ReactNode } from 'react'
import { bundledPostHog } from '../contracts/posthog'
import { postHogOptions } from './posthogOptions'

// Initialized when the browser first loads this module, before hydration, so effects in any component can capture.
if (bundledPostHog && typeof window !== 'undefined' && !posthog.__loaded) {
  posthog.init(bundledPostHog.projectToken, postHogOptions(bundledPostHog, window.location.hostname))
}

/**
 * Gives components `usePostHog()` and the feature flag hooks, and captures render errors from routes without their own
 * `errorComponent`. Renders its children alone when PostHog is off.
 */
export function PostHogIntegration({ children }: { children: ReactNode }) {
  if (!bundledPostHog) return children
  return (
    <PostHogProvider client={posthog}>
      <PostHogErrorBoundary
        fallback={<main className="mx-auto max-w-2xl px-6 py-16">Something went wrong. Reload the page to try again.</main>}
      >
        {children}
      </PostHogErrorBoundary>
    </PostHogProvider>
  )
}

/** The router's `defaultOnCatch`, for routes with an `errorComponent`, whose boundary catches the error before `PostHogIntegration`'s. */
export function captureRenderError(error: unknown) {
  if (posthog.__loaded) posthog.captureException(error)
}
