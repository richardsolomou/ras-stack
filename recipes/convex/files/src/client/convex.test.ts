import { convexQuery } from '@convex-dev/react-query'
import { describe, expect, it } from 'vitest'
import { api } from '../../convex/_generated/api'
import { connectConvex, convexGcTimeMs } from './convex'
import { createQueryClient } from './queryClient'

const url = 'https://happy-otter-123.convex.cloud'

describe('connectConvex', () => {
  it('refuses to start without a deployment URL', () => {
    expect(() => connectConvex(createQueryClient(), '')).toThrow('VITE_CONVEX_URL is not set')
  })

  it('keys Convex queries by function name and arguments', () => {
    const queryClient = createQueryClient()
    connectConvex(queryClient, url)
    expect(queryClient.defaultQueryOptions(convexQuery(api.notes.list, {})).queryHash).toBe('convexQuery|notes:list|{}')
  })

  it('releases unused Convex subscriptions after the Convex gc time', () => {
    const queryClient = createQueryClient()
    connectConvex(queryClient, url)
    expect(queryClient.defaultQueryOptions(convexQuery(api.notes.list, {})).gcTime).toBe(convexGcTimeMs)
  })

  it('keeps the application defaults for other queries', async () => {
    const queryClient = createQueryClient()
    connectConvex(queryClient, url)
    expect(await queryClient.fetchQuery({ queryKey: ['count'], queryFn: () => 1 })).toBe(1)
    expect(queryClient.defaultQueryOptions({ queryKey: ['count'] }).staleTime).toBe(
      createQueryClient().getDefaultOptions().queries?.staleTime,
    )
  })
})
