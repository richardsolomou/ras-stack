import { PostHogErrorBoundary, PostHogProvider } from '@posthog/react'
import { createElement, type ReactNode } from 'react'
import type { PostHogConfig } from 'posthog-js'
import { postHogBrowserOptions } from './client.js'
import type { PostHogEnvironment } from './config.js'

export function PostHogIntegration({
  children,
  environment,
  fallback = createElement('main', null, 'Something went wrong. Refresh the page to try again.'),
  options,
}: {
  children?: ReactNode
  environment: PostHogEnvironment | undefined
  fallback?: ReactNode
  options?: Partial<PostHogConfig>
}) {
  if (!environment) return children
  const tracingHostnames = typeof window === 'undefined' ? undefined : [window.location.hostname]
  return createElement(
    PostHogProvider,
    {
      apiKey: environment.projectToken,
      options: postHogBrowserOptions({
        apiHost: '/ingest',
        uiHost: environment.uiHost,
        ...(tracingHostnames ? { tracingHostnames } : {}),
        ...(options ? { options } : {}),
      }),
    },
    createElement(PostHogErrorBoundary, { fallback }, children),
  )
}
