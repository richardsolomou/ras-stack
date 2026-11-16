import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { ConvexProvider } from 'convex/react'
import { connectConvex } from './client/convex'
import { captureRenderError } from './client/posthog'
import { createQueryClient } from './client/queryClient'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = createQueryClient()
  const convex = connectConvex(queryClient)
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    scrollRestoration: true,
    defaultOnCatch: captureRenderError,
    Wrap: ({ children }) => <ConvexProvider client={convex.convexClient}>{children}</ConvexProvider>,
    defaultNotFoundComponent: () => (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Page not found</h1>
      </main>
    ),
  })
  // Also wraps the app in QueryClientProvider and carries server-fetched queries into the browser.
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
