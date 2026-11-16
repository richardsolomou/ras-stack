import type { QueryClient } from '@tanstack/react-query'
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from '@tanstack/react-router'
import { chunkRecoveryScript, updateNoticeId } from '../client/chunkRecovery'
import { PostHogIntegration } from '../client/posthog'
import styles from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [{ charSet: 'utf-8' }, { name: 'viewport', content: 'width=device-width, initial-scale=1' }, { title: 'App' }],
    links: [{ rel: 'stylesheet', href: styles }],
    scripts: [{ children: chunkRecoveryScript }],
  }),
  component: Root,
})

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-dvh bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <p id={updateNoticeId} hidden className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-950">
          A new version is available. Reload the page to continue.
        </p>
        <PostHogIntegration>
          <Outlet />
        </PostHogIntegration>
        <Scripts />
      </body>
    </html>
  )
}
