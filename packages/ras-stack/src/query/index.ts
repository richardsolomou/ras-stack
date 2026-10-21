import { createElement, useState, type ReactNode } from 'react'
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

export function QueryProvider({ children, client, state }: { children?: ReactNode; client?: QueryClient; state?: DehydratedState }) {
  const [initialClient] = useState(() => client ?? createQueryClient())
  return createElement(QueryClientProvider, { client: client ?? initialClient }, createElement(HydrationBoundary, { state }, children))
}
