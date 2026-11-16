import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import { posthog, type PostHogConfig } from 'posthog-js'
import type { ReactNode } from 'react'
import { bundledPostHog, ingestPath, serviceName, type PostHogEnvironment } from '../contracts/posthog'

/** Browser SDK options; `defaults` pins the SDK's behavior to a dated snapshot, so raise it only after reading what changed. */
export function postHogOptions(environment: PostHogEnvironment, hostname: string, mode = import.meta.env.MODE): Partial<PostHogConfig> {
  const service = { serviceName: `${serviceName}-web`, environment: mode }
  return {
    api_host: ingestPath,
    ui_host: environment.uiHost,
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    capture_exceptions: true,
    capture_performance: true,
    mask_personal_data_properties: true,
    // Password reset and invitation links carry their secret in `token`.
    custom_personal_data_properties: ['token'],
    session_recording: { maskAllInputs: true },
    // Only this origin's requests carry the person and session headers, so no third party learns them.
    tracing_headers: [hostname],
    logs: service,
    metrics: service,
  }
}

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
