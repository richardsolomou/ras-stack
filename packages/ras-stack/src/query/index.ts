import { createElement, type ReactNode } from 'react'
import { HydrationBoundary, QueryClient, QueryClientProvider, type DehydratedState, type QueryClientConfig } from '@tanstack/react-query'

export function createQueryClient(config: QueryClientConfig = {}): QueryClient {
  return new QueryClient({
    ...config,
    defaultOptions: {
      ...config.defaultOptions,
      queries: { staleTime: 60_000, ...config.defaultOptions?.queries },
    },
  })
}

export function QueryProvider({ children, client, state }: { children?: ReactNode; client: QueryClient; state?: DehydratedState }) {
  if (!client) throw new Error('QueryProvider requires a client with an application-owned lifetime')
  return createElement(QueryClientProvider, { client }, createElement(HydrationBoundary, { state }, children))
}
