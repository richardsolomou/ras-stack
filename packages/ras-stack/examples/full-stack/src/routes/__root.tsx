import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { postHogEnvironment } from 'ras-stack/posthog'
import { PostHogIntegration } from 'ras-stack/posthog/react'
import styles from '../styles.css?url'

const posthog = postHogEnvironment({
  projectToken: import.meta.env.VITE_POSTHOG_PROJECT_TOKEN,
  host: import.meta.env.VITE_POSTHOG_HOST,
})

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'ras-stack full-stack example' },
    ],
    links: [{ rel: 'stylesheet', href: styles }],
  }),
  component: Root,
})

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <PostHogIntegration environment={posthog}>
          <Outlet />
        </PostHogIntegration>
        <Scripts />
      </body>
    </html>
  )
}
