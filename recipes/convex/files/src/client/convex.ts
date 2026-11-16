import { ConvexQueryClient } from '@convex-dev/react-query'
import type { QueryClient } from '@tanstack/react-query'

/** Unused Convex subscriptions close this long after their last component unmounts, instead of Query's five-minute default. */
export const convexGcTimeMs = 10_000

/**
 * Lets `queryClient` run Convex queries: `convexQuery(api.module.fn, args)` keys hash by function name, fetch over HTTP during
 * server rendering, and stay subscribed over the Convex WebSocket in the browser. Other queries keep their own `queryFn`.
 */
export function connectConvex(queryClient: QueryClient, url: string | undefined = import.meta.env.VITE_CONVEX_URL) {
  if (!url) throw new Error('VITE_CONVEX_URL is not set; run `pnpm dev` once to create a deployment and write it to .env.local')
  const convex = new ConvexQueryClient(url)
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, queryKeyHashFn: convex.hashFn(), queryFn: convex.queryFn() },
  })
  queryClient.setQueryDefaults(['convexQuery'], { gcTime: convexGcTimeMs })
  convex.connect(queryClient)
  return convex
}
