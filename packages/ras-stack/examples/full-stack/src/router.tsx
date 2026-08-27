import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { createQueryClient } from './client/queryClient'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = createQueryClient()
  const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' })
  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
