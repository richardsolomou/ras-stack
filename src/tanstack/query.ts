import { QueryClient, type QueryClientConfig } from '@tanstack/react-query'

export function createStackQueryClient(config: QueryClientConfig = {}) {
  return new QueryClient({ defaultOptions: { queries: { staleTime: 1000 } }, ...config })
}

export function queryErrorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  return error instanceof Error && error.message ? error.message : fallback
}
