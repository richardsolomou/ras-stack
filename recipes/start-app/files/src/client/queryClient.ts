import { QueryClient } from '@tanstack/react-query'

/** One client per browser session and one per server request, so cached data never crosses between users. */
export function createQueryClient() {
  // Long enough that queries hydrated from the server render are not fetched again straight away.
  return new QueryClient({ defaultOptions: { queries: { staleTime: 1000 } } })
}
